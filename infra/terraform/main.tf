locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
  })
  normalized_frontend_origins = [
    for origin in var.frontend_origins : trimsuffix(origin, "/")
  ]
  default_oauth_urls = distinct(flatten([
    for origin in local.normalized_frontend_origins : [
      origin,
      "${origin}/career/index.html"
    ]
  ]))
  oauth_callback_urls    = length(var.frontend_oauth_callback_urls) > 0 ? var.frontend_oauth_callback_urls : local.default_oauth_urls
  oauth_logout_urls      = length(var.frontend_oauth_logout_urls) > 0 ? var.frontend_oauth_logout_urls : local.default_oauth_urls
  google_enabled         = nonsensitive(var.google_client_id != "" && var.google_client_secret != "")
  apple_enabled          = nonsensitive(var.apple_client_id != "" && var.apple_team_id != "" && var.apple_key_id != "" && var.apple_private_key != "")
  linkedin_provider_name = "LinkedInOIDC"
  linkedin_enabled       = nonsensitive(var.linkedin_client_id != "" && var.linkedin_client_secret != "")
  hosted_ui_enabled      = local.google_enabled || local.apple_enabled || local.linkedin_enabled
  cognito_domain_prefix  = var.cognito_domain_prefix != "" ? var.cognito_domain_prefix : "${local.name_prefix}-${random_string.suffix.result}"
  supported_identity_providers = concat(
    ["COGNITO"],
    local.google_enabled ? ["Google"] : [],
    local.apple_enabled ? ["SignInWithApple"] : [],
    local.linkedin_enabled ? [local.linkedin_provider_name] : []
  )
  social_provider_labels = concat(
    local.google_enabled ? ["Google"] : [],
    local.apple_enabled ? ["Apple"] : [],
    local.linkedin_enabled ? ["LinkedIn"] : []
  )
  ses_identity_arn = var.ses_from_email != "" ? "arn:aws:ses:${var.aws_region}:${data.aws_caller_identity.current.account_id}:identity/${var.ses_from_email}" : ""
  cognito_uses_ses = local.ses_identity_arn != ""
}

data "aws_caller_identity" "current" {}

resource "random_string" "suffix" {
  length  = 6
  lower   = true
  upper   = false
  numeric = true
  special = false
}

resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  schema {
    attribute_data_type = "String"
    name                = "email"
    required            = true
    mutable             = true
  }

  schema {
    attribute_data_type = "String"
    name                = "name"
    required            = false
    mutable             = true
  }

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Потвърди регистрацията си в CareerLane"
    email_message        = <<-EOT
      <html><body style="margin:0;padding:0;background:#eef2ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Manrope',Helvetica,Arial,sans-serif;color:#1b2722;">
        <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
          <p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#56695f;margin:0 0 8px;">CareerLane</p>
          <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;letter-spacing:-0.01em;">Потвърди регистрацията си</h1>
          <p style="font-size:15px;line-height:1.6;color:#3f534a;margin:0 0 20px;">Здравей,</p>
          <p style="font-size:15px;line-height:1.6;color:#3f534a;margin:0 0 24px;">За да активираш профила си в CareerLane, въведи следния код в страницата за потвърждение:</p>
          <div style="font-size:32px;font-weight:800;letter-spacing:0.18em;padding:18px 24px;border-radius:16px;background:#dfe7e1;text-align:center;color:#324840;margin:0 0 24px;">{####}</div>
          <p style="font-size:13px;line-height:1.6;color:#56695f;margin:0 0 8px;">Кодът е валиден за ограничен период от време. Ако не си се регистрирал/а в CareerLane, можеш да игнорираш това съобщение.</p>
          <hr style="border:none;border-top:1px solid #d7ddd9;margin:24px 0;">
          <p style="font-size:12px;color:#74867d;margin:0;">CareerLane · Платформа за кариерни консултации и менторство</p>
        </div>
      </body></html>
    EOT
  }

  dynamic "email_configuration" {
    for_each = local.cognito_uses_ses ? [1] : []
    content {
      email_sending_account = "DEVELOPER"
      from_email_address    = "CareerLane <${var.ses_from_email}>"
      source_arn            = local.ses_identity_arn
    }
  }

  lifecycle {
    # Cognito does not allow schema mutations after pool creation.
    # Ignore provider drift here so later applies can update the rest
    # of the stack without forcing an invalid schema update attempt.
    ignore_changes = [schema]
  }

  tags = local.common_tags
}

# Authorise Cognito to send emails through the configured SES identity.
# Only created when ses_from_email is set (otherwise Cognito falls back to
# its built-in COGNITO_DEFAULT sender, which uses no-reply@verificationemail.com).
resource "aws_ses_identity_policy" "cognito_sender" {
  count    = local.cognito_uses_ses ? 1 : 0
  identity = var.ses_from_email
  name     = "${local.name_prefix}-cognito-sender"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowCognitoToSendFromIdentity"
      Effect = "Allow"
      Principal = {
        Service = "cognito-idp.amazonaws.com"
      }
      Action = [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ]
      Resource = local.ses_identity_arn
    }]
  })
}

resource "aws_cognito_user_pool_client" "frontend" {
  name         = "${local.name_prefix}-frontend"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  prevent_user_existence_errors        = "ENABLED"
  allowed_oauth_flows_user_pool_client = local.hosted_ui_enabled
  allowed_oauth_flows                  = local.hosted_ui_enabled ? ["code"] : []
  allowed_oauth_scopes                 = local.hosted_ui_enabled ? ["email", "openid", "profile"] : []
  callback_urls                        = local.hosted_ui_enabled ? local.oauth_callback_urls : []
  logout_urls                          = local.hosted_ui_enabled ? local.oauth_logout_urls : []
  supported_identity_providers         = local.supported_identity_providers

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  depends_on = [
    aws_cognito_identity_provider.google,
    aws_cognito_identity_provider.apple,
    aws_cognito_identity_provider.linkedin
  ]
}

resource "aws_cognito_user_pool_domain" "frontend" {
  count = local.hosted_ui_enabled ? 1 : 0

  domain       = local.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_identity_provider" "google" {
  count = local.google_enabled ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    authorize_scopes = "email openid profile"
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
  }

  attribute_mapping = {
    email   = "email"
    name    = "name"
    picture = "picture"
  }
}

resource "aws_cognito_identity_provider" "apple" {
  count = local.apple_enabled ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "SignInWithApple"
  provider_type = "SignInWithApple"

  provider_details = {
    authorize_scopes = "email name"
    client_id        = var.apple_client_id
    team_id          = var.apple_team_id
    key_id           = var.apple_key_id
    private_key      = var.apple_private_key
  }

  attribute_mapping = {
    email = "email"
    name  = "name"
  }
}

resource "aws_cognito_identity_provider" "linkedin" {
  count = local.linkedin_enabled ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = local.linkedin_provider_name
  provider_type = "OIDC"

  provider_details = {
    attributes_request_method = "GET"
    attributes_url            = "https://api.linkedin.com/v2/userinfo"
    authorize_scopes          = "openid profile email"
    authorize_url             = "https://www.linkedin.com/oauth/v2/authorization"
    client_id                 = var.linkedin_client_id
    client_secret             = var.linkedin_client_secret
    jwks_uri                  = "https://www.linkedin.com/oauth/openid/jwks"
    oidc_issuer               = "https://www.linkedin.com"
    token_url                 = "https://www.linkedin.com/oauth/v2/accessToken"
  }

  attribute_mapping = {
    email   = "email"
    name    = "name"
    picture = "picture"
  }
}

resource "aws_s3_bucket" "cv_documents" {
  bucket = "${local.name_prefix}-cv-${random_string.suffix.result}"
  tags   = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "cv_documents" {
  bucket                  = aws_s3_bucket.cv_documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cv_documents" {
  bucket = aws_s3_bucket.cv_documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "cv_documents" {
  bucket = aws_s3_bucket.cv_documents.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = var.frontend_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_dynamodb_table" "users" {
  name         = "${local.name_prefix}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "consultants" {
  name         = "${local.name_prefix}-consultants"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "consultantId"

  attribute {
    name = "consultantId"
    type = "S"
  }

  attribute {
    name = "slug"
    type = "S"
  }

  attribute {
    name = "ownerUserId"
    type = "S"
  }

  global_secondary_index {
    name            = "slug-index"
    hash_key        = "slug"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "owner-index"
    hash_key        = "ownerUserId"
    projection_type = "ALL"
  }

  tags = local.common_tags
}

resource "aws_dynamodb_table" "bookings" {
  name         = "${local.name_prefix}-bookings"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "bookingId"

  attribute {
    name = "bookingId"
    type = "S"
  }

  attribute {
    name = "clientId"
    type = "S"
  }

  attribute {
    name = "consultantId"
    type = "S"
  }

  global_secondary_index {
    name            = "client-index"
    hash_key        = "clientId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "consultant-index"
    hash_key        = "consultantId"
    projection_type = "ALL"
  }

  tags = local.common_tags
}

resource "aws_iam_role" "lambda" {
  name = "${local.name_prefix}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "lambda" {
  name = "${local.name_prefix}-lambda-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:TransactWriteItems",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.users.arn,
          aws_dynamodb_table.consultants.arn,
          aws_dynamodb_table.bookings.arn,
          "${aws_dynamodb_table.consultants.arn}/index/*",
          "${aws_dynamodb_table.bookings.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.cv_documents.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail"
        ]
        Resource = "*"
      }
    ]
  })
}

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/../../backend/api"
  output_path = "${path.module}/.terraform-build/careerdoc-api.zip"
}

resource "aws_lambda_function" "api" {
  function_name                  = "${local.name_prefix}-api"
  role                           = aws_iam_role.lambda.arn
  runtime                        = "nodejs20.x"
  handler                        = "index.handler"
  filename                       = data.archive_file.api.output_path
  source_code_hash               = data.archive_file.api.output_base64sha256
  architectures                  = ["arm64"]
  timeout                        = 29
  memory_size                    = 512
  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      USERS_TABLE       = aws_dynamodb_table.users.name
      CONSULTANTS_TABLE = aws_dynamodb_table.consultants.name
      BOOKINGS_TABLE    = aws_dynamodb_table.bookings.name
      CV_BUCKET         = aws_s3_bucket.cv_documents.bucket
      ALLOWED_ORIGIN    = element(var.frontend_origins, 0)
      SES_FROM_EMAIL    = var.ses_from_email
      APP_URL           = var.app_url
    }
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_api" "http" {
  name          = "${local.name_prefix}-http-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = false
    allow_headers     = ["authorization", "content-type"]
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_origins     = var.frontend_origins
    max_age           = 3600
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id          = aws_apigatewayv2_api.http.id
  name            = "${local.name_prefix}-jwt"
  authorizer_type = "JWT"
  identity_sources = [
    "$request.header.Authorization"
  ]

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.frontend.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "consultants_list" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /consultants"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "consultants_slug" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /consultants/{slug}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "consultants_me_get" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /consultants/me"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "consultants_me_put" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PUT /consultants/me"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "bootstrap" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /auth/bootstrap"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "me_profile_get" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /me/profile"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "me_profile_put" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PUT /me/profile"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "upload_url" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /me/cv/upload-url"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "bookings_get" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /bookings"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "bookings_post" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /bookings"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "bookings_cancel" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PATCH /bookings/{bookingId}/status"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "admin_consultants_list" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /admin/consultants"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "admin_consultant_status" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PUT /admin/consultants/{consultantId}/status"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "admin_consultant_get" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /admin/consultants/{consultantId}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Users in this group can approve/reject consultant profiles. Add manually via AWS CLI: aws cognito-idp admin-add-user-to-group --user-pool-id <id> --username <email> --group-name admin"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = var.api_throttle_burst_limit
    throttling_rate_limit  = var.api_throttle_rate_limit
  }

  tags = local.common_tags
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

resource "aws_cloudwatch_event_rule" "booking_reminders" {
  name                = "${local.name_prefix}-booking-reminders"
  description         = "Hourly trigger to send day-before booking reminder emails."
  schedule_expression = "rate(1 hour)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "booking_reminders" {
  rule      = aws_cloudwatch_event_rule.booking_reminders.name
  target_id = "${local.name_prefix}-booking-reminders-target"
  arn       = aws_lambda_function.api.arn
}

resource "aws_lambda_permission" "booking_reminders" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.booking_reminders.arn
}
