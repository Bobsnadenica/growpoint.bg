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
      "${origin}/",
      "${origin}/index.html"
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
  cognito_ses_identity_arn = var.cognito_ses_from_email != "" ? "arn:aws:ses:${var.aws_region}:${data.aws_caller_identity.current.account_id}:identity/${var.cognito_ses_from_email}" : ""
  cognito_uses_ses         = local.cognito_ses_identity_arn != ""
  frontend_bucket_name     = var.frontend_bucket_name != "" ? var.frontend_bucket_name : "${local.name_prefix}-frontend-${data.aws_caller_identity.current.account_id}"
  frontend_origin_id       = "${local.name_prefix}-frontend-s3"
  frontend_aliases         = var.frontend_acm_certificate_arn != "" ? var.frontend_domain_aliases : []
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
  # PINNED — do NOT derive from name_prefix. A Cognito user pool's name is
  # immutable; changing it forces a full replacement, which would destroy every
  # registered account (email + Google/Apple/LinkedIn), mint a new pool id, and
  # break the API Gateway JWT authorizer + hosted UI. The name is an internal,
  # user-invisible label, so it stays at the original value through the
  # careerdoc -> growpoint project rename to protect existing users.
  name = "careerdoc-dev-users"

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
    email_subject        = "Потвърди регистрацията си в GrowPoint"
    email_message        = <<-EOT
      <html><body style="margin:0;padding:0;background:#eef2ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Manrope',Helvetica,Arial,sans-serif;color:#1b2722;">
        <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
          <p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#56695f;margin:0 0 8px;">GrowPoint</p>
          <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;letter-spacing:-0.01em;">Потвърди регистрацията си</h1>
          <p style="font-size:15px;line-height:1.6;color:#3f534a;margin:0 0 20px;">Здравей,</p>
          <p style="font-size:15px;line-height:1.6;color:#3f534a;margin:0 0 24px;">За да активираш профила си в GrowPoint, въведи следния код в страницата за потвърждение:</p>
          <div style="font-size:32px;font-weight:800;letter-spacing:0.18em;padding:18px 24px;border-radius:16px;background:#dfe7e1;text-align:center;color:#324840;margin:0 0 24px;">{####}</div>
          <p style="font-size:13px;line-height:1.6;color:#56695f;margin:0 0 8px;">Кодът е валиден за ограничен период от време. Ако не си се регистрирал/а в GrowPoint, можеш да игнорираш това съобщение.</p>
          <hr style="border:none;border-top:1px solid #d7ddd9;margin:24px 0;">
          <p style="font-size:12px;color:#74867d;margin:0;">GrowPoint · Платформа за кариерни консултации и менторство</p>
        </div>
      </body></html>
    EOT
  }

  dynamic "email_configuration" {
    for_each = local.cognito_uses_ses ? [1] : []
    content {
      email_sending_account  = "DEVELOPER"
      from_email_address     = "GrowPoint <${var.cognito_ses_from_email}>"
      reply_to_email_address = "contactus@growpoint.bg"
      source_arn             = local.cognito_ses_identity_arn
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
# Only created when cognito_ses_from_email is set (otherwise Cognito falls back to
# its built-in COGNITO_DEFAULT sender, which uses no-reply@verificationemail.com).
resource "aws_ses_identity_policy" "cognito_sender" {
  count    = local.cognito_uses_ses ? 1 : 0
  identity = var.cognito_ses_from_email
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
      Resource = local.cognito_ses_identity_arn
    }]
  })
}

resource "aws_ses_domain_identity" "platform" {
  count  = var.ses_domain_identity != "" ? 1 : 0
  domain = var.ses_domain_identity
}

resource "aws_ses_domain_dkim" "platform" {
  count  = var.ses_domain_identity != "" ? 1 : 0
  domain = aws_ses_domain_identity.platform[0].domain
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

  lifecycle {
    # AWS auto-populates these endpoint/identifier fields for the first-class
    # Google provider after creation; ignore them so plans don't show a phantom
    # in-place diff on every run. client_id/client_secret stay tracked.
    ignore_changes = [
      attribute_mapping["username"],
      provider_details["attributes_url"],
      provider_details["attributes_url_add_attributes"],
      provider_details["authorize_url"],
      provider_details["oidc_issuer"],
      provider_details["token_request_method"],
      provider_details["token_url"],
    ]
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

  lifecycle {
    # AWS auto-populates the Apple endpoint/identifier fields after creation, and
    # private_key is write-only (read back empty). Ignore them so plans don't show
    # a phantom in-place diff on every run. client_id/team_id/key_id stay tracked.
    # To rotate the .p8 key, update terraform.tfvars and `terraform apply -replace`
    # this resource.
    ignore_changes = [
      attribute_mapping["username"],
      provider_details["attributes_url_add_attributes"],
      provider_details["authorize_url"],
      provider_details["oidc_issuer"],
      provider_details["token_request_method"],
      provider_details["token_url"],
      provider_details["private_key"],
    ]
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
    # Must EXACTLY match the `iss` claim in LinkedIn's id_token, else Cognito
    # rejects every LinkedIn login with "bad id_token issuer". LinkedIn's OIDC
    # discovery (https://www.linkedin.com/oauth/.well-known/openid-configuration)
    # reports issuer = https://www.linkedin.com/oauth (NOT the bare domain).
    oidc_issuer = "https://www.linkedin.com/oauth"
    token_url   = "https://www.linkedin.com/oauth/v2/accessToken"
  }

  attribute_mapping = {
    email   = "email"
    name    = "name"
    picture = "picture"
  }

  lifecycle {
    # AWS adds these computed fields after creation; ignore so plans stay clean.
    # client_id/client_secret stay tracked.
    ignore_changes = [
      attribute_mapping["username"],
      provider_details["attributes_url_add_attributes"],
    ]
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

resource "aws_s3_bucket" "frontend" {
  count  = var.frontend_hosting_enabled ? 1 : 0
  bucket = local.frontend_bucket_name

  tags = merge(local.common_tags, {
    Component = "frontend"
  })
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  count  = var.frontend_hosting_enabled ? 1 : 0
  bucket = aws_s3_bucket.frontend[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  count  = var.frontend_hosting_enabled ? 1 : 0
  bucket = aws_s3_bucket.frontend[0].id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  count  = var.frontend_hosting_enabled ? 1 : 0
  bucket = aws_s3_bucket.frontend[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  count  = var.frontend_hosting_enabled ? 1 : 0
  bucket = aws_s3_bucket.frontend[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  count                             = var.frontend_hosting_enabled ? 1 : 0
  name                              = "${local.name_prefix}-frontend-oac"
  description                       = "Private S3 access for the GrowPoint frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "frontend_rewrite" {
  count   = var.frontend_hosting_enabled ? 1 : 0
  name    = "${local.name_prefix}-frontend-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Resolve directory-style requests to their index.html object"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (uri.endsWith('/')) {
        request.uri = uri + 'index.html';
      } else if (uri.lastIndexOf('.') < uri.lastIndexOf('/')) {
        request.uri = uri + '/index.html';
      }
      return request;
    }
  EOT

  # Create the renamed function and let the distribution switch to it before the
  # old one is deleted (CloudFront refuses to delete a function still attached
  # to a distribution). Safe because old/new names differ.
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_cloudfront_response_headers_policy" "frontend_security" {
  count   = var.frontend_hosting_enabled ? 1 : 0
  name    = "${local.name_prefix}-frontend-security"
  comment = "Security headers for the GrowPoint static frontend"

  security_headers_config {
    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }

    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  count = var.frontend_hosting_enabled ? 1 : 0

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.name_prefix} frontend"
  default_root_object = "index.html"
  price_class         = var.frontend_cloudfront_price_class
  aliases             = local.frontend_aliases

  origin {
    domain_name              = aws_s3_bucket.frontend[0].bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend[0].id
    origin_id                = local.frontend_origin_id
  }

  default_cache_behavior {
    target_origin_id           = local.frontend_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.frontend_security[0].id
    compress                   = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.frontend_rewrite[0].arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/assets/*"
    target_origin_id           = local.frontend_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.frontend_security[0].id
    compress                   = true
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = var.frontend_acm_certificate_arn != "" ? var.frontend_acm_certificate_arn : null
    cloudfront_default_certificate = var.frontend_acm_certificate_arn == ""
    minimum_protocol_version       = var.frontend_acm_certificate_arn != "" ? "TLSv1.2_2021" : null
    ssl_support_method             = var.frontend_acm_certificate_arn != "" ? "sni-only" : null
  }

  tags = merge(local.common_tags, {
    Component = "frontend"
  })
}

data "aws_iam_policy_document" "frontend_bucket" {
  count = var.frontend_hosting_enabled ? 1 : 0

  statement {
    sid     = "AllowCloudFrontRead"
    actions = ["s3:GetObject"]

    resources = [
      "${aws_s3_bucket.frontend[0].arn}/*"
    ]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  count  = var.frontend_hosting_enabled ? 1 : 0
  bucket = aws_s3_bucket.frontend[0].id
  policy = data.aws_iam_policy_document.frontend_bucket[0].json
}

resource "aws_acm_certificate" "frontend" {
  count    = length(var.frontend_certificate_domains) > 0 ? 1 : 0
  provider = aws.us_east_1

  domain_name               = var.frontend_certificate_domains[0]
  subject_alternative_names = slice(var.frontend_certificate_domains, 1, length(var.frontend_certificate_domains))
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, {
    Component = "frontend"
  })
}

resource "aws_dynamodb_table" "users" {
  name         = "${local.name_prefix}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"


  attribute {
    name = "userId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
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

  attribute {
    name = "profileStatus"
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

  global_secondary_index {
    name            = "profile-status-index"
    hash_key        = "profileStatus"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
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

  point_in_time_recovery {
    enabled = true
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
          "ses:SendEmail",
          "ses:GetAccount"
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.cv_documents.arn
      },
      {
        # Read-only: admin metrics count the real Cognito user pool (authoritative
        # registration numbers + provider/confirmation breakdown). No write/admin
        # mutation actions are granted.
        Effect = "Allow"
        Action = [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminListGroupsForUser",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:DescribeUserPool",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser"
        ]
        Resource = aws_cognito_user_pool.main.arn
      }
    ]
  })
}

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/../../backend/api"
  output_path = "${path.module}/.terraform-build/growpoint-api.zip"
}

resource "aws_lambda_function" "api" {
  function_name                  = "${local.name_prefix}-api"
  role                           = aws_iam_role.lambda.arn
  runtime                        = "nodejs22.x"
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
      USER_POOL_ID      = aws_cognito_user_pool.main.id
      CV_BUCKET         = aws_s3_bucket.cv_documents.bucket
      ALLOWED_ORIGIN    = element(var.frontend_origins, 0)
      ALLOWED_ORIGINS   = join(",", var.frontend_origins)
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


# Public page-view beacon (no JWT authorizer).
resource "aws_apigatewayv2_route" "metrics_visit" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /metrics/visit"
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

# Public, link-shareable member card (safe fields only; no auth).
resource "aws_apigatewayv2_route" "public_user" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /public/users/{id}"
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

resource "aws_apigatewayv2_route" "me_data_export" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /me/data-export"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "me_delete" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "DELETE /me"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "me_notifications_get" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /me/notifications"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "me_notifications_mark_read" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /me/notifications/mark-read"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "me_document_download_url" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /me/documents/download-url"
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

resource "aws_apigatewayv2_route" "bookings_reschedule" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PATCH /bookings/{bookingId}/reschedule"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "bookings_review" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /bookings/{bookingId}/review"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "bookings_session_confirm" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /bookings/{bookingId}/session-confirm"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "bookings_messages_get" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /bookings/{bookingId}/messages"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "bookings_messages_post" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /bookings/{bookingId}/messages"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "bookings_ics" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /bookings/{bookingId}/ics"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

# Consultant sets the online-meeting link on a confirmed booking.
resource "aws_apigatewayv2_route" "bookings_meeting_link" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PUT /bookings/{bookingId}/meeting-link"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "admin_bookings_list" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /admin/bookings"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

# Admin manual "mark paid" bridge until Stripe is wired.
resource "aws_apigatewayv2_route" "admin_booking_paid" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PUT /admin/bookings/{bookingId}/paid"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "admin_metrics" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /admin/metrics"
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

# Admin email invites (free comped consultant onboarding) + account restrict.
resource "aws_apigatewayv2_route" "admin_invite_create" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /admin/invites"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "admin_invite_list" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /admin/invites"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "admin_user_restrict" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PUT /admin/users/{userId}/restrict"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "admin_consultant_featured" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PUT /admin/consultants/{consultantId}/featured"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

# Admin-granted visibility package (start/grow/spotlight).
resource "aws_apigatewayv2_route" "admin_consultant_package" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PUT /admin/consultants/{consultantId}/package"
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

resource "aws_apigatewayv2_route" "admin_user_message" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /admin/users/{userId}/message"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Users in this group can approve/reject consultant profiles. Add manually via AWS CLI: aws cognito-idp admin-add-user-to-group --user-pool-id <id> --username <email> --group-name admin"
}

resource "aws_cognito_user_group" "consultants" {
  name         = "consultants"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Members are treated as consultants/mentors: /auth/bootstrap forces role=consultant and creates a consultant draft. Promote a Cognito user with: aws cognito-idp admin-add-user-to-group --user-pool-id <id> --username <email> --group-name consultants (they pick it up on next login). Takes precedence over the clients group."
}

resource "aws_cognito_user_group" "clients" {
  name         = "clients"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Members are treated as regular users (clients): /auth/bootstrap forces role=client. Use this to explicitly designate a manually-created Cognito user as a user, or to demote a consultant. Assign with: aws cognito-idp admin-add-user-to-group --user-pool-id <id> --username <email> --group-name clients (picked up on next login). client is also the default when no group is set."
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = var.api_throttle_burst_limit
    throttling_rate_limit  = var.api_throttle_rate_limit
  }


  route_settings {
    route_key              = aws_apigatewayv2_route.admin_metrics.route_key
    throttling_burst_limit = 5
    throttling_rate_limit  = 1
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

# --- Basic observability: email the team when the API Lambda errors/throttles.
# The SNS email subscription must be confirmed once (SNS sends a confirmation
# link to the address; independent of SES, so it delivers even in SES sandbox).
resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"
  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "contactus@growpoint.bg"
}

resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${local.name_prefix}-api-errors"
  alarm_description   = "API Lambda reported function errors in the last 5 minutes."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = local.common_tags
}

# Lambda Errors alone does not catch handled HTTP 500 responses.
# HTTP APIs use the lowercase metric name "5xx" (not REST API "5XXError").
resource "aws_cloudwatch_metric_alarm" "http_server_errors" {
  alarm_name          = "${local.name_prefix}-http-server-errors"
  alarm_description   = "API Gateway returned server errors, including handled Lambda failures and timeouts."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = aws_apigatewayv2_api.http.id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "api_throttles" {
  alarm_name          = "${local.name_prefix}-api-throttles"
  alarm_description   = "API Lambda invocations are being throttled."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = local.common_tags
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
