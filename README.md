# Monarch Money MCP Server

A Model Context Protocol (MCP) server that enables AI assistants to interact with your Monarch Money personal finance data. Manage accounts, transactions, budgets, and analyze your finances programmatically.

## Features

### 🔐 Authentication
- Email/password login with MFA support
- Session persistence (sessions last ~90 days)
- Automatic session management

### 💰 Account Management
- View all linked accounts (banks, credit cards, investments, etc.)
- Get account balance history
- View investment holdings
- Create/update/delete manual accounts
- Refresh account data

### 📊 Transaction Operations
- Search and filter transactions
- Create, update, and delete transactions
- Split transactions across categories
- Add tags and categories
- Get transaction summaries

### 📈 Budget & Cashflow
- View and set budgets by category
- Get cashflow summaries
- Analyze spending by category and merchant
- Track income vs expenses

### 🏷️ Organization
- Manage categories and tags
- View recurring transactions
- Link to financial institutions

## Installation

```bash
npm install
npm run build
```

## Configuration

### Environment Variables

Set these environment variables for automatic authentication:

```bash
export MONARCH_EMAIL="your@email.com"
export MONARCH_PASSWORD="your_password"
export MONARCH_MFA_SECRET="your_mfa_secret_key"  # Optional
```

**Getting your MFA Secret Key:**
1. Go to Monarch Money Settings → Security
2. Enable MFA
3. Copy the "Two-factor text code" (TOTP secret)
4. Use this as your `MONARCH_MFA_SECRET`

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "monarch-money": {
      "command": "node",
      "args": ["/path/to/monarch-money-mcp/dist/index.js"],
      "env": {
        "MONARCH_EMAIL": "your@email.com",
        "MONARCH_PASSWORD": "your_password",
        "MONARCH_MFA_SECRET": "your_mfa_secret"
      }
    }
  }
}
```

## Usage Examples

### Authentication

```typescript
// Login manually
await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_login",
  arguments: {
    email: "your@email.com",
    password: "your_password",
    mfa_secret_key: "optional_mfa_secret"
  }
});

// Check authentication status
await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_check_auth"
});
```

### View Accounts

```typescript
// Get all accounts
const accounts = await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_get_accounts"
});

// Get account balance history
const history = await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_get_account_history",
  arguments: {
    account_id: "account-uuid",
    start_date: "2025-01-01",
    end_date: "2025-01-31"
  }
});
```

### Manage Transactions

```typescript
// Get recent transactions
const transactions = await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_get_transactions",
  arguments: {
    limit: 50,
    start_date: "2025-01-01",
    end_date: "2025-01-31"
  }
});

// Create a new transaction
await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_create_transaction",
  arguments: {
    amount: -45.50,
    date: "2025-02-01",
    account_id: "account-uuid",
    merchant_name: "Coffee Shop",
    category_id: "category-uuid",
    notes: "Morning coffee"
  }
});

// Update existing transaction
await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_update_transaction",
  arguments: {
    transaction_id: "transaction-uuid",
    category_id: "new-category-uuid",
    notes: "Updated note"
  }
});

// Split a transaction
await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_update_transaction_splits",
  arguments: {
    transaction_id: "transaction-uuid",
    splits: [
      { amount: -30.00, category_id: "groceries-uuid" },
      { amount: -15.00, category_id: "household-uuid" }
    ]
  }
});
```

### Budget Management

```typescript
// Get current budgets
const budgets = await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_get_budgets"
});

// Set a budget
await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_set_budget_amount",
  arguments: {
    category_id: "category-uuid",
    amount: 500.00,
    date: "2025-02-01"
  }
});
```

### Cashflow Analysis

```typescript
// Get cashflow summary
const cashflow = await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_get_cashflow",
  arguments: {
    start_date: "2025-01-01",
    end_date: "2025-01-31"
  }
});

// Analyze spending by category
const byCategory = await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_get_cashflow_by_category",
  arguments: {
    start_date: "2025-01-01",
    end_date: "2025-01-31"
  }
});

// Top merchants
const byMerchant = await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_get_cashflow_by_merchant",
  arguments: {
    start_date: "2025-01-01",
    end_date: "2025-01-31",
    limit: 10
  }
});
```

### Categories and Tags

```typescript
// Get all categories
const categories = await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_get_categories"
});

// Create a new category
await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_create_category",
  arguments: {
    name: "Side Projects",
    icon: "💻"
  }
});

// Create and apply tags
await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_create_tag",
  arguments: {
    name: "Business Expense",
    color: "#4CAF50"
  }
});

await use_mcp_tool({
  server_name: "monarch-money",
  tool_name: "monarch_set_transaction_tags",
  arguments: {
    transaction_id: "transaction-uuid",
    tag_ids: ["tag-uuid-1", "tag-uuid-2"]
  }
});
```

## API Reference

### Authentication Tools

- `monarch_login` - Login with email/password (supports MFA)
- `monarch_check_auth` - Check authentication status

### Account Tools

- `monarch_get_accounts` - Get all accounts
- `monarch_get_account_history` - Get balance history
- `monarch_get_account_holdings` - Get investment holdings
- `monarch_get_account_types` - List account types
- `monarch_create_manual_account` - Create manual account
- `monarch_update_account` - Update account details
- `monarch_delete_account` - Delete account
- `monarch_refresh_accounts` - Sync with institutions

### Transaction Tools

- `monarch_get_transactions` - Search transactions
- `monarch_get_transaction_details` - Get transaction details
- `monarch_get_transaction_splits` - Get split information
- `monarch_get_transactions_summary` - Get summary stats
- `monarch_create_transaction` - Create transaction
- `monarch_update_transaction` - Update transaction
- `monarch_delete_transaction` - Delete transaction
- `monarch_update_transaction_splits` - Split transaction

### Budget Tools

- `monarch_get_budgets` - Get all budgets
- `monarch_set_budget_amount` - Set/update budget

### Cashflow Tools

- `monarch_get_cashflow` - Get cashflow summary
- `monarch_get_cashflow_by_category` - Breakdown by category
- `monarch_get_cashflow_by_merchant` - Breakdown by merchant

### Organization Tools

- `monarch_get_categories` - Get categories
- `monarch_get_tags` - Get tags
- `monarch_create_category` - Create category
- `monarch_delete_category` - Delete category
- `monarch_create_tag` - Create tag
- `monarch_set_transaction_tags` - Apply tags

### Other Tools

- `monarch_get_recurring_transactions` - View recurring transactions
- `monarch_get_subscription` - Subscription details
- `monarch_get_institutions` - Linked institutions

## Development

### Build
```bash
npm run build
```

### Test with MCP Inspector
```bash
npm run inspector
```

## Security Notes

- **Session Storage**: Sessions are stored in `~/.monarch_session.json`
- **Credentials**: Never commit credentials to version control
- **MFA Recommended**: Always enable MFA on your Monarch Money account
- **Environment Variables**: Use environment variables or secure secret management

## Common Use Cases

### Monthly Budget Review
1. Get budgets for current month
2. Get actual spending by category
3. Identify over-budget categories
4. Adjust budgets as needed

### Transaction Categorization
1. Get uncategorized transactions
2. Update categories based on merchant
3. Add tags for tracking
4. Split transactions if needed

### Financial Analysis
1. Get cashflow over time periods
2. Analyze spending trends
3. Identify top expenses
4. Track savings rate

### Account Management
1. Create manual accounts for cash/assets
2. Update balances regularly
3. Track investment holdings
4. Monitor account history

## Troubleshooting

### Authentication Issues
- Verify email/password are correct
- Check MFA secret key if using auto-MFA
- Try deleting `~/.monarch_session.json` and re-logging in

### GraphQL Errors
- Check Monarch Money API status
- Verify account UUIDs are correct
- Ensure dates are in YYYY-MM-DD format

### Session Expiration
- Sessions typically last ~90 days
- Re-authenticate if receiving 401 errors
- Save session after successful login

## Credits

Built with:
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) - MCP TypeScript SDK
- [axios](https://github.com/axios/axios) - HTTP client
- [zod](https://github.com/colinhacks/zod) - Schema validation
- [otplib](https://github.com/yeojz/otplib) - TOTP for MFA

Inspired by community Python libraries for Monarch Money API access.

## License

MIT

## Disclaimer

This is an unofficial MCP server for Monarch Money. It is not affiliated with, endorsed by, or connected to Monarch Money in any way. Use at your own risk.
