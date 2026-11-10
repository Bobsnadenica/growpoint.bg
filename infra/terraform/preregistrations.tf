# No provisioned capacity or recurring job. Records expire automatically.
resource "aws_dynamodb_table" "preregistrations" {
  name                        = "${local.name_prefix}-preregistrations"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "id"
  deletion_protection_enabled = true
  attribute {
    name = "id"
    type = "S"
  }
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
  lifecycle {
    prevent_destroy = true
  }
  tags = local.common_tags
}

resource "aws_iam_role_policy" "preregistrations" {
  name = "${local.name_prefix}-preregistrations"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Scan"]
      Resource = aws_dynamodb_table.preregistrations.arn
    }]
  })
}
