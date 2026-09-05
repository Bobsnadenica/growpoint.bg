variable "monthly_budget_usd" {
  type        = number
  default     = 5
  description = "Account-wide monthly warning threshold, not a spending cap."
  validation {
    condition     = var.monthly_budget_usd > 0
    error_message = "Budget must be positive."
  }
}

resource "aws_budgets_budget" "low_traffic" {
  name         = "${local.name_prefix}-monthly-cost-warning"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 20
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = ["contactus@growpoint.bg"]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = ["contactus@growpoint.bg"]
  }
}
