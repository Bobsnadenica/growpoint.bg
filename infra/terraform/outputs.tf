output "api_base_url" {
  value = aws_apigatewayv2_api.http.api_endpoint
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_client_id" {
  value = aws_cognito_user_pool_client.frontend.id
}

output "cognito_hosted_ui_domain" {
  value = local.hosted_ui_enabled ? "${aws_cognito_user_pool_domain.frontend[0].domain}.auth.${var.aws_region}.amazoncognito.com" : ""
}

output "cv_bucket_name" {
  value = aws_s3_bucket.cv_documents.bucket
}

output "users_table_name" {
  value = aws_dynamodb_table.users.name
}

output "consultants_table_name" {
  value = aws_dynamodb_table.consultants.name
}

output "bookings_table_name" {
  value = aws_dynamodb_table.bookings.name
}

output "frontend_bucket_name" {
  value = var.frontend_hosting_enabled ? aws_s3_bucket.frontend[0].bucket : ""
}

output "frontend_cloudfront_distribution_id" {
  value = var.frontend_hosting_enabled ? aws_cloudfront_distribution.frontend[0].id : ""
}

output "frontend_cloudfront_domain_name" {
  value = var.frontend_hosting_enabled ? aws_cloudfront_distribution.frontend[0].domain_name : ""
}

output "frontend_certificate_arn" {
  value = length(var.frontend_certificate_domains) > 0 ? aws_acm_certificate.frontend[0].arn : ""
}

output "frontend_certificate_validation_records" {
  value = length(var.frontend_certificate_domains) > 0 ? [
    for record in aws_acm_certificate.frontend[0].domain_validation_options : {
      domain_name = record.domain_name
      name        = record.resource_record_name
      type        = record.resource_record_type
      value       = record.resource_record_value
    }
  ] : []
}

output "ses_domain_verification_record" {
  value = var.ses_domain_identity != "" ? {
    domain_name = var.ses_domain_identity
    name        = "_amazonses.${var.ses_domain_identity}"
    type        = "TXT"
    value       = aws_ses_domain_identity.platform[0].verification_token
  } : null
}

output "ses_domain_dkim_records" {
  value = var.ses_domain_identity != "" ? [
    for token in aws_ses_domain_dkim.platform[0].dkim_tokens : {
      domain_name = var.ses_domain_identity
      name        = "${token}._domainkey.${var.ses_domain_identity}"
      type        = "CNAME"
      value       = "${token}.dkim.amazonses.com"
    }
  ] : []
}

output "frontend_env_snippet" {
  value = <<-EOT
VITE_APP_NAME=GrowPoint
VITE_AWS_REGION=${var.aws_region}
VITE_API_BASE_URL=${aws_apigatewayv2_api.http.api_endpoint}
VITE_COGNITO_USER_POOL_ID=${aws_cognito_user_pool.main.id}
VITE_COGNITO_USER_POOL_CLIENT_ID=${aws_cognito_user_pool_client.frontend.id}
${local.hosted_ui_enabled ? "VITE_COGNITO_DOMAIN=${aws_cognito_user_pool_domain.frontend[0].domain}.auth.${var.aws_region}.amazoncognito.com" : ""}
${length(local.social_provider_labels) > 0 ? "VITE_COGNITO_SOCIAL_PROVIDERS=${join(",", local.social_provider_labels)}" : ""}
VITE_BASE_PATH=/
EOT
}
