variable "project_name" {
  type    = string
  default = "growpoint"
}


variable "environment" {
  type    = string
  default = "dev"
}

variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "frontend_origins" {
  type    = list(string)
  default = ["http://localhost:5173"]
}

variable "api_throttle_burst_limit" {
  type    = number
  default = 50
}

variable "api_throttle_rate_limit" {
  type    = number
  default = 20
}

variable "lambda_reserved_concurrency" {
  type     = number
  default  = null
  nullable = true
}

variable "frontend_oauth_callback_urls" {
  type    = list(string)
  default = []
}

variable "frontend_oauth_logout_urls" {
  type    = list(string)
  default = []
}

variable "cognito_domain_prefix" {
  type    = string
  default = ""
}

variable "google_client_id" {
  type    = string
  default = ""
}

variable "google_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "apple_client_id" {
  type    = string
  default = ""
}

variable "apple_team_id" {
  type    = string
  default = ""
}

variable "apple_key_id" {
  type    = string
  default = ""
}

variable "apple_private_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "linkedin_client_id" {
  type    = string
  default = ""
}

variable "linkedin_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "ses_from_email" {
  type        = string
  default     = ""
  description = "Verified SES sender address for platform booking/notification emails. If empty, the Lambda logs emails instead of sending."
}

variable "cognito_ses_from_email" {
  type        = string
  default     = ""
  description = "Optional verified SES sender address for Cognito verification emails. Leave empty to use Cognito's default sender."
}

variable "ses_domain_identity" {
  type        = string
  default     = ""
  description = "Optional domain to verify in SES for platform transactional email sending, for example growpoint.bg."
}

variable "app_url" {
  type        = string
  default     = "https://www.growpoint.bg/"
  description = "Public app URL used in email bodies."
}

variable "frontend_hosting_enabled" {
  type        = bool
  default     = false
  description = "Create a private S3 bucket and CloudFront distribution for the frontend SPA."
}

variable "frontend_bucket_name" {
  type        = string
  default     = ""
  description = "Optional globally unique S3 bucket name for frontend hosting. Defaults to a project/account based name."
}

variable "frontend_domain_aliases" {
  type        = list(string)
  default     = []
  description = "Custom domain aliases to attach to the CloudFront frontend distribution after an ACM certificate is issued."
}

variable "frontend_acm_certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate ARN in us-east-1 for CloudFront custom aliases."
}

variable "frontend_certificate_domains" {
  type        = list(string)
  default     = []
  description = "Optional domains for an ACM DNS-validated certificate request in us-east-1. Terraform outputs DNS records; jethost.bg must create them."
}

variable "frontend_cloudfront_price_class" {
  type        = string
  default     = "PriceClass_100"
  description = "CloudFront price class for the frontend distribution."
}
