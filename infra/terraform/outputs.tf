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

output "frontend_env_snippet" {
  value = <<-EOT
VITE_APP_NAME=CareerLane
VITE_AWS_REGION=${var.aws_region}
VITE_API_BASE_URL=${aws_apigatewayv2_api.http.api_endpoint}
VITE_COGNITO_USER_POOL_ID=${aws_cognito_user_pool.main.id}
VITE_COGNITO_USER_POOL_CLIENT_ID=${aws_cognito_user_pool_client.frontend.id}
${local.hosted_ui_enabled ? "VITE_COGNITO_DOMAIN=${aws_cognito_user_pool_domain.frontend[0].domain}.auth.${var.aws_region}.amazoncognito.com" : ""}
${length(local.social_provider_labels) > 0 ? "VITE_COGNITO_SOCIAL_PROVIDERS=${join(",", local.social_provider_labels)}" : ""}
VITE_BASE_PATH=/career/
EOT
}
