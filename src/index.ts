#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { MonarchClient } from './monarch-client.js';

// Initialize Monarch client
const client = new MonarchClient({
  email: process.env.MONARCH_EMAIL,
  password: process.env.MONARCH_PASSWORD,
  mfaSecretKey: process.env.MONARCH_MFA_SECRET,
});

// Authentication state management
let authenticationAttempted = false;

async function ensureAuthenticated() {
  if (client.isAuthenticated()) {
    return;
  }

  if (!authenticationAttempted) {
    // Try to load saved session first
    const sessionLoaded = await client.loadSession();
    
    if (!sessionLoaded && process.env.MONARCH_EMAIL && process.env.MONARCH_PASSWORD) {
      // Try to login with credentials
      await client.login();
    }
    
    authenticationAttempted = true;
  }

  if (!client.isAuthenticated()) {
    throw new Error(
      'Not authenticated. Please use the monarch_login tool or set MONARCH_EMAIL and MONARCH_PASSWORD environment variables.'
    );
  }
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const tools: Tool[] = [
  // Authentication tools
  {
    name: 'monarch_login',
    description: 'Login to Monarch Money with email and password. Supports MFA via secret key. Session is saved for future use.',
    inputSchema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Monarch Money account email',
        },
        password: {
          type: 'string',
          description: 'Monarch Money account password',
        },
        mfa_secret_key: {
          type: 'string',
          description: 'Optional: MFA secret key (TOTP) for automatic MFA. Found in Settings -> Security when setting up MFA.',
        },
      },
      required: ['email', 'password'],
    },
  },
  
  {
    name: 'monarch_check_auth',
    description: 'Check if currently authenticated with Monarch Money',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // Account tools
  {
    name: 'monarch_get_accounts',
    description: 'Get all accounts linked to Monarch Money including banks, credit cards, investments, etc.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'monarch_get_accounts_summary',
    description: 'Get a lightweight summary of all accounts (id, name, type, balance). Much faster than monarch_get_accounts — no institution logos. Supports filtering by account type and hidden status.',
    inputSchema: {
      type: 'object',
      properties: {
        account_type: {
          type: 'string',
          description: 'Filter by account type name: "brokerage", "depository", "credit", "loan", "real_estate", "vehicle", "other", "other_asset", "other_liability", "valuables", "equity"',
        },
        include_hidden: {
          type: 'boolean',
          description: 'Include hidden accounts (default: false)',
          default: false,
        },
      },
    },
  },

  {
    name: 'monarch_get_account_history',
    description: 'Get daily balance snapshots (net worth history) over a date range. Returns daily balance, assets, and liabilities totals.',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: {
          type: 'string',
          description: 'UUID of a specific account to filter by (optional — omit for all accounts)',
        },
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format (optional)',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (optional)',
        },
      },
    },
  },

  {
    name: 'monarch_get_account_holdings',
    description: 'Get securities/holdings for an investment account (stocks, bonds, ETFs, etc.) including quantity, value, cost basis, and current price',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: {
          type: 'string',
          description: 'UUID of the investment account',
        },
      },
      required: ['account_id'],
    },
  },

  {
    name: 'monarch_get_account_types',
    description: 'Get all available account types in Monarch Money (brokerage, credit, depository, loan, other)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'monarch_create_manual_account',
    description: 'Create a new manual account (cash, property, loan, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: {
          type: 'string',
          description: 'Name of the account',
        },
        type: {
          type: 'string',
          description: 'Account type (e.g., "cash", "credit", "investment")',
        },
        subtype: {
          type: 'string',
          description: 'Account subtype (optional)',
        },
        current_balance: {
          type: 'number',
          description: 'Current balance of the account',
        },
        is_asset: {
          type: 'boolean',
          description: 'Whether this account is an asset (true) or liability (false)',
        },
      },
      required: ['display_name', 'type', 'current_balance', 'is_asset'],
    },
  },

  {
    name: 'monarch_update_account',
    description: 'Update an existing account',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: {
          type: 'string',
          description: 'UUID of the account to update',
        },
        display_name: {
          type: 'string',
          description: 'New name for the account (optional)',
        },
        current_balance: {
          type: 'number',
          description: 'New balance for the account (optional)',
        },
        is_hidden: {
          type: 'boolean',
          description: 'Hide/show the account (optional)',
        },
      },
      required: ['account_id'],
    },
  },

  {
    name: 'monarch_delete_account',
    description: 'Delete an account from Monarch Money',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: {
          type: 'string',
          description: 'UUID of the account to delete',
        },
      },
      required: ['account_id'],
    },
  },

  {
    name: 'monarch_refresh_accounts',
    description: 'Request a refresh/sync of linked accounts with financial institutions',
    inputSchema: {
      type: 'object',
      properties: {
        account_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Specific account IDs to refresh. If not provided, refreshes all.',
        },
      },
    },
  },

  // Transaction tools
  {
    name: 'monarch_get_transactions',
    description: 'Get transactions with optional filters. Returns paginated results.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of transactions to return (default: 100, max: 1000)',
          default: 100,
        },
        offset: {
          type: 'number',
          description: 'Number of transactions to skip for pagination (default: 0)',
          default: 0,
        },
        start_date: {
          type: 'string',
          description: 'Filter transactions from this date (YYYY-MM-DD)',
        },
        end_date: {
          type: 'string',
          description: 'Filter transactions until this date (YYYY-MM-DD)',
        },
        search: {
          type: 'string',
          description: 'Search term to filter transactions by merchant name or notes',
        },
      },
    },
  },

  {
    name: 'monarch_get_transaction_details',
    description: 'Get detailed information for a specific transaction including category, merchant, tags, and splits',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_id: {
          type: 'string',
          description: 'UUID of the transaction',
        },
      },
      required: ['transaction_id'],
    },
  },

  {
    name: 'monarch_get_transaction_splits',
    description: 'Get split details for a transaction (if it has been split across multiple categories)',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_id: {
          type: 'string',
          description: 'UUID of the transaction',
        },
      },
      required: ['transaction_id'],
    },
  },

  {
    name: 'monarch_get_transactions_summary',
    description: 'Get summary statistics for transactions in a date range (income, expenses, net income, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },

  {
    name: 'monarch_create_transaction',
    description: 'Create a new manual transaction',
    inputSchema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Transaction amount (positive for income, negative for expense)',
        },
        date: {
          type: 'string',
          description: 'Transaction date in YYYY-MM-DD format',
        },
        account_id: {
          type: 'string',
          description: 'UUID of the account',
        },
        merchant_name: {
          type: 'string',
          description: 'Name of the merchant (optional)',
        },
        category_id: {
          type: 'string',
          description: 'UUID of the category (optional)',
        },
        notes: {
          type: 'string',
          description: 'Notes for the transaction (optional)',
        },
      },
      required: ['amount', 'date', 'account_id'],
    },
  },

  {
    name: 'monarch_update_transaction',
    description: 'Update an existing transaction',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_id: {
          type: 'string',
          description: 'UUID of the transaction to update',
        },
        amount: {
          type: 'number',
          description: 'New amount (optional)',
        },
        date: {
          type: 'string',
          description: 'New date in YYYY-MM-DD format (optional)',
        },
        merchant_name: {
          type: 'string',
          description: 'New merchant name (optional)',
        },
        category_id: {
          type: 'string',
          description: 'New category UUID (optional)',
        },
        notes: {
          type: 'string',
          description: 'New notes (optional)',
        },
        hide_from_reports: {
          type: 'boolean',
          description: 'Hide/show transaction in reports (optional)',
        },
      },
      required: ['transaction_id'],
    },
  },

  {
    name: 'monarch_delete_transaction',
    description: 'Delete a transaction',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_id: {
          type: 'string',
          description: 'UUID of the transaction to delete',
        },
      },
      required: ['transaction_id'],
    },
  },

  {
    name: 'monarch_update_transaction_splits',
    description: 'Split a transaction across multiple categories or update existing splits',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_id: {
          type: 'string',
          description: 'UUID of the transaction to split',
        },
        splits: {
          type: 'array',
          description: 'Array of split details',
          items: {
            type: 'object',
            properties: {
              amount: {
                type: 'number',
                description: 'Amount for this split',
              },
              category_id: {
                type: 'string',
                description: 'Category UUID for this split (optional)',
              },
              merchant_name: {
                type: 'string',
                description: 'Merchant name for this split (optional)',
              },
              notes: {
                type: 'string',
                description: 'Notes for this split (optional)',
              },
            },
            required: ['amount'],
          },
        },
      },
      required: ['transaction_id', 'splits'],
    },
  },

  // Budget tools
  {
    name: 'monarch_get_budgets',
    description: 'Get budgets with planned vs actual amounts per category for a date range. Defaults to current month.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start month in YYYY-MM-DD format (optional, defaults to current month)',
        },
        end_date: {
          type: 'string',
          description: 'End month in YYYY-MM-DD format (optional, defaults to start month)',
        },
      },
    },
  },

  {
    name: 'monarch_set_budget_amount',
    description: 'Set or update a budget amount for a category. Set amount to 0 to clear the budget.',
    inputSchema: {
      type: 'object',
      properties: {
        category_id: {
          type: 'string',
          description: 'UUID of the category to budget',
        },
        amount: {
          type: 'number',
          description: 'Budget amount (set to 0 to clear)',
        },
        date: {
          type: 'string',
          description: 'Date for the budget in YYYY-MM-DD format (defaults to current month)',
        },
      },
      required: ['category_id', 'amount'],
    },
  },

  // Cashflow tools
  {
    name: 'monarch_get_cashflow',
    description: 'Get cashflow summary for a date range (income, expenses, savings, savings rate)',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },

  {
    name: 'monarch_get_cashflow_by_category',
    description: 'Get income and expenses broken down by category',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },

  {
    name: 'monarch_get_cashflow_by_merchant',
    description: 'Get spending totals by merchant for a date range',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
        limit: {
          type: 'number',
          description: 'Limit number of merchants returned (optional)',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },

  // Category and Tag tools
  {
    name: 'monarch_get_categories',
    description: 'Get all transaction categories and category groups',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'monarch_get_tags',
    description: 'Get all transaction tags',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'monarch_create_category',
    description: 'Create a new transaction category',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the category',
        },
        group_id: {
          type: 'string',
          description: 'UUID of the category group (optional)',
        },
        icon: {
          type: 'string',
          description: 'Icon name for the category (optional)',
        },
      },
      required: ['name'],
    },
  },

  {
    name: 'monarch_delete_category',
    description: 'Delete a transaction category',
    inputSchema: {
      type: 'object',
      properties: {
        category_id: {
          type: 'string',
          description: 'UUID of the category to delete',
        },
      },
      required: ['category_id'],
    },
  },

  {
    name: 'monarch_create_tag',
    description: 'Create a new transaction tag',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the tag',
        },
        color: {
          type: 'string',
          description: 'Hex color code for the tag (e.g., "#FF5733") (optional)',
        },
      },
      required: ['name'],
    },
  },

  {
    name: 'monarch_set_transaction_tags',
    description: 'Set tags on a transaction (replaces existing tags)',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_id: {
          type: 'string',
          description: 'UUID of the transaction',
        },
        tag_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of tag UUIDs to apply',
        },
      },
      required: ['transaction_id', 'tag_ids'],
    },
  },

  // Other tools
  {
    name: 'monarch_get_recurring_transactions',
    description: 'Get recurring transactions grouped by status (complete, upcoming) with expense/income summaries for the current month',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'monarch_get_subscription',
    description: 'Get Monarch Money subscription details (premium status, payment source, trial info)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'monarch_get_institutions',
    description: 'Get all linked financial institutions',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// =============================================================================
// TOOL HANDLERS
// =============================================================================

async function handleToolCall(name: string, args: any): Promise<any> {
  switch (name) {
    // Authentication
    case 'monarch_login':
      await client.login(args.email, args.password, args.mfa_secret_key);
      return { success: true, message: 'Successfully logged in to Monarch Money' };

    case 'monarch_check_auth':
      return {
        authenticated: client.isAuthenticated(),
        message: client.isAuthenticated() 
          ? 'Currently authenticated with Monarch Money' 
          : 'Not authenticated. Please login using monarch_login tool.',
      };

    // Accounts
    case 'monarch_get_accounts':
      await ensureAuthenticated();
      return await client.getAccounts();

    case 'monarch_get_accounts_summary':
      await ensureAuthenticated();
      return await client.getAccountsSummary(args.account_type, args.include_hidden ?? false);

    case 'monarch_get_account_history':
      await ensureAuthenticated();
      return await client.getAccountHistory(args.account_id, args.start_date, args.end_date);

    case 'monarch_get_account_holdings':
      await ensureAuthenticated();
      return await client.getAccountHoldings(args.account_id);

    case 'monarch_get_account_types':
      await ensureAuthenticated();
      return await client.getAccountTypeOptions();

    case 'monarch_create_manual_account':
      await ensureAuthenticated();
      return await client.createManualAccount({
        displayName: args.display_name,
        type: args.type,
        subtype: args.subtype,
        currentBalance: args.current_balance,
        isAsset: args.is_asset,
      });

    case 'monarch_update_account':
      await ensureAuthenticated();
      return await client.updateAccount(args.account_id, {
        displayName: args.display_name,
        currentBalance: args.current_balance,
        isHidden: args.is_hidden,
      });

    case 'monarch_delete_account':
      await ensureAuthenticated();
      return await client.deleteAccount(args.account_id);

    case 'monarch_refresh_accounts':
      await ensureAuthenticated();
      return await client.requestAccountsRefresh(args.account_ids);

    // Transactions
    case 'monarch_get_transactions':
      await ensureAuthenticated();
      return await client.getTransactions({
        limit: args.limit || 100,
        offset: args.offset || 0,
        startDate: args.start_date,
        endDate: args.end_date,
        search: args.search,
      });

    case 'monarch_get_transaction_details':
      await ensureAuthenticated();
      return await client.getTransactionDetails(args.transaction_id);

    case 'monarch_get_transaction_splits':
      await ensureAuthenticated();
      return await client.getTransactionSplits(args.transaction_id);

    case 'monarch_get_transactions_summary':
      await ensureAuthenticated();
      return await client.getTransactionsSummary(args.start_date, args.end_date);

    case 'monarch_create_transaction':
      await ensureAuthenticated();
      return await client.createTransaction({
        amount: args.amount,
        date: args.date,
        accountId: args.account_id,
        merchantName: args.merchant_name,
        categoryId: args.category_id,
        notes: args.notes,
      });

    case 'monarch_update_transaction':
      await ensureAuthenticated();
      return await client.updateTransaction(args.transaction_id, {
        amount: args.amount,
        date: args.date,
        merchantName: args.merchant_name,
        categoryId: args.category_id,
        notes: args.notes,
        hideFromReports: args.hide_from_reports,
      });

    case 'monarch_delete_transaction':
      await ensureAuthenticated();
      return await client.deleteTransaction(args.transaction_id);

    case 'monarch_update_transaction_splits':
      await ensureAuthenticated();
      return await client.updateTransactionSplits(
        args.transaction_id,
        args.splits.map((split: any) => ({
          amount: split.amount,
          categoryId: split.category_id,
          merchantName: split.merchant_name,
          notes: split.notes,
        }))
      );

    // Budgets
    case 'monarch_get_budgets':
      await ensureAuthenticated();
      return await client.getBudgets(args.start_date, args.end_date);

    case 'monarch_set_budget_amount':
      await ensureAuthenticated();
      return await client.setBudgetAmount(args.category_id, args.amount, args.date);

    // Cashflow
    case 'monarch_get_cashflow':
      await ensureAuthenticated();
      return await client.getCashflow(args.start_date, args.end_date);

    case 'monarch_get_cashflow_by_category':
      await ensureAuthenticated();
      return await client.getCashflowByCategory(args.start_date, args.end_date);

    case 'monarch_get_cashflow_by_merchant':
      await ensureAuthenticated();
      return await client.getCashflowByMerchant(args.start_date, args.end_date, args.limit);

    // Categories and Tags
    case 'monarch_get_categories':
      await ensureAuthenticated();
      return await client.getTransactionCategories();

    case 'monarch_get_tags':
      await ensureAuthenticated();
      return await client.getTransactionTags();

    case 'monarch_create_category':
      await ensureAuthenticated();
      return await client.createTransactionCategory(args.name, args.group_id, args.icon);

    case 'monarch_delete_category':
      await ensureAuthenticated();
      return await client.deleteTransactionCategory(args.category_id);

    case 'monarch_create_tag':
      await ensureAuthenticated();
      return await client.createTransactionTag(args.name, args.color);

    case 'monarch_set_transaction_tags':
      await ensureAuthenticated();
      return await client.setTransactionTags(args.transaction_id, args.tag_ids);

    // Other
    case 'monarch_get_recurring_transactions':
      await ensureAuthenticated();
      return await client.getRecurringTransactions();

    case 'monarch_get_subscription':
      await ensureAuthenticated();
      return await client.getSubscriptionDetails();

    case 'monarch_get_institutions':
      await ensureAuthenticated();
      return await client.getInstitutions();

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// =============================================================================
// MCP SERVER SETUP
// =============================================================================

const server = new Server(
  {
    name: 'monarch-money-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const result = await handleToolCall(request.params.name, request.params.arguments || {});
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Monarch Money MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
