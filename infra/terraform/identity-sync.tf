# Trails cannot filter management events by eventName or include eventSource.
# Log regional write management events; EventBridge below filters the four
# Cognito lifecycle operations. No read/data events, Insights or CloudTrail Lake.
resource "aws_s3_bucket" "identity_audit" {
  bucket = "${local.name_prefix}-identity-audit-${data.aws_caller_identity.current.account_id}"
  tags   = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "identity_audit" {
  bucket                  = aws_s3_bucket.identity_audit.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "identity_audit" {
  bucket = aws_s3_bucket.identity_audit.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "identity_audit" {
  bucket = aws_s3_bucket.identity_audit.id
  rule {
    id     = "short-audit-retention"
    status = "Enabled"
    filter { prefix = "" }
    expiration { days = 30 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}

resource "aws_s3_bucket_policy" "identity_audit" {
  bucket = aws_s3_bucket.identity_audit.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudTrailAclCheck"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.identity_audit.arn
        Condition = { StringEquals = { "aws:SourceArn" = "arn:aws:cloudtrail:${var.aws_region}:${data.aws_caller_identity.current.account_id}:trail/${local.name_prefix}-identity-lifecycle" } }
      },
      {
        Sid       = "CloudTrailWrite"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.identity_audit.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = { StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control", "aws:SourceArn" = "arn:aws:cloudtrail:${var.aws_region}:${data.aws_caller_identity.current.account_id}:trail/${local.name_prefix}-identity-lifecycle" } }
      },
      {
        Sid       = "HttpsOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.identity_audit.arn, "${aws_s3_bucket.identity_audit.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      }
    ]
  })
}

resource "aws_cloudtrail" "identity_lifecycle" {
  name                          = "${local.name_prefix}-identity-lifecycle"
  s3_bucket_name                = aws_s3_bucket.identity_audit.id
  include_global_service_events = false
  is_multi_region_trail         = false
  enable_logging                = true
  enable_log_file_validation    = false
  advanced_event_selector {
    name = "Regional write management events"
    field_selector {
      field  = "eventCategory"
      equals = ["Management"]
    }
    field_selector {
      field  = "readOnly"
      equals = ["false"]
    }
    field_selector {
      field      = "eventSource"
      not_equals = ["kms.amazonaws.com", "rdsdata.amazonaws.com"]
    }
  }
  depends_on = [aws_s3_bucket_policy.identity_audit]
  tags       = local.common_tags
}

resource "aws_cloudwatch_event_rule" "identity_lifecycle" {
  name = "${local.name_prefix}-identity-lifecycle"
  event_pattern = jsonencode({
    source        = ["aws.cognito-idp"]
    "detail-type" = ["AWS API Call via CloudTrail"]
    detail = {
      eventSource = ["cognito-idp.amazonaws.com"]
      eventName   = ["AdminDeleteUser", "DeleteUser", "AdminDisableUser", "AdminEnableUser"]
      "$or" = [
        { requestParameters = { userPoolId = [aws_cognito_user_pool.main.id] } },
        { additionalEventData = { userPoolId = [aws_cognito_user_pool.main.id] } }
      ]
    }
  })
  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "identity_lifecycle" {
  rule = aws_cloudwatch_event_rule.identity_lifecycle.name
  arn  = aws_lambda_function.api.arn
  retry_policy {
    maximum_event_age_in_seconds = 86400
    maximum_retry_attempts       = 10
  }
}

resource "aws_lambda_permission" "identity_lifecycle" {
  statement_id  = "AllowCognitoLifecycleEvents"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.identity_lifecycle.arn
}
