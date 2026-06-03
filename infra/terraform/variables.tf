variable "project_name" {
  type    = string
  default = "careerdoc"
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
  description = "Verified SES sender address for booking notifications. If empty, the Lambda logs emails instead of sending."
}

variable "app_url" {
  type        = string
  default     = "https://www.bobsnadenica.com/career/"
  description = "Public app URL used in email bodies."
}
