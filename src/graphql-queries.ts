/**
 * GraphQL queries and mutations for Monarch Money API
 * Based on api.monarch.com GraphQL endpoint
 * Audited against live API: 2026-02-22
 */

export const QUERIES = {
  // Account queries
  GET_ACCOUNTS: `
    query GetAccounts {
      accounts {
        id
        displayName
        type {
          name
          display
        }
        subtype {
          name
          display
        }
        currentBalance
        isHidden
        isAsset
        mask
        createdAt
        updatedAt
        syncDisabled
        isManual
        includeInNetWorth
        hideFromList
        hideTransactionsFromReports
        institution {
          id
          name
          logo
        }
      }
    }
  `,

  // Lightweight account summary (no institution logos)
  GET_ACCOUNTS_SUMMARY: `
    query GetAccountsSummary {
      accounts {
        id
        displayName
        type {
          name
          display
        }
        subtype {
          name
          display
        }
        currentBalance
        isHidden
        isAsset
        includeInNetWorth
        institution {
          id
          name
        }
      }
    }
  `,

  // Aggregate balance snapshots over a date range (net worth history)
  GET_ACCOUNT_HISTORY: `
    query Common_GetAggregateSnapshots($filters: AggregateSnapshotFilters) {
      aggregateSnapshots(filters: $filters) {
        date
        balance
        assetsBalance
        liabilitiesBalance
      }
    }
  `,

  // Per-account recent daily balances
  GET_ACCOUNT_RECENT_BALANCES: `
    query Web_GetAccountsPageRecentBalance($startDate: Date) {
      accounts {
        id
        displayName
        recentBalances(startDate: $startDate)
        type { name display group }
        includeInNetWorth
      }
    }
  `,

  // Investment holdings for specific accounts
  GET_ACCOUNT_HOLDINGS: `
    query Web_GetHoldings($input: PortfolioInput) {
      portfolio(input: $input) {
        aggregateHoldings {
          edges {
            node {
              id
              quantity
              basis
              totalValue
              securityPriceChangeDollars
              securityPriceChangePercent
              lastSyncedAt
              holdings {
                id
                type
                typeDisplay
                name
                ticker
                closingPrice
                isManual
                costBasis
                quantity
              }
              security {
                id
                name
                type
                ticker
                typeDisplay
                currentPrice
                currentPriceUpdatedAt
                closingPrice
                oneDayChangePercent
                oneDayChangeDollars
              }
            }
          }
        }
      }
    }
  `,

  // Transaction queries
  GET_TRANSACTIONS: `
    query GetTransactions($offset: Int, $limit: Int, $filters: TransactionFilterInput, $orderBy: TransactionOrdering) {
      allTransactions(filters: $filters) {
        totalCount
        results(offset: $offset, limit: $limit, orderBy: $orderBy) {
          id
          amount
          pending
          date
          hideFromReports
          plaidName
          notes
          isRecurring
          reviewStatus
          needsReview
          merchant {
            id
            name
          }
          category {
            id
            name
          }
          account {
            id
            displayName
          }
          tags {
            id
            name
          }
        }
      }
    }
  `,

  GET_TRANSACTION_DETAILS: `
    query GetTransactionDetails($id: UUID!) {
      getTransaction(id: $id) {
        id
        amount
        pending
        date
        hideFromReports
        plaidName
        notes
        isRecurring
        reviewStatus
        needsReview
        merchant {
          id
          name
        }
        category {
          id
          name
          group {
            id
            name
            type
          }
        }
        account {
          id
          displayName
          type {
            name
            display
          }
        }
        tags {
          id
          name
          color
        }
        splitTransactions {
          id
          amount
          category {
            id
            name
          }
          merchant {
            id
            name
          }
          notes
        }
      }
    }
  `,

  // Transaction splits are returned as part of transaction details (splitTransactions field)
  GET_TRANSACTION_SPLITS: `
    query GetTransactionSplits($id: UUID!) {
      getTransaction(id: $id) {
        id
        amount
        splitTransactions {
          id
          amount
          category {
            id
            name
          }
          merchant {
            id
            name
          }
          notes
        }
      }
    }
  `,

  // Transaction summary via aggregates
  GET_TRANSACTIONS_SUMMARY: `
    query GetTransactionsSummary($filters: TransactionFilterInput) {
      aggregates(filters: $filters) {
        summary {
          sumIncome
          sumExpense
          savings
          savingsRate
          count
          avg
        }
      }
    }
  `,

  // Budget data with per-category breakdowns
  GET_BUDGETS: `
    query Common_BudgetDataQuery($startDate: Date!, $endDate: Date!) {
      budgetData(startMonth: $startDate, endMonth: $endDate) {
        totalsByMonth {
          month
          totalExpenses { actualAmount plannedAmount remainingAmount previousMonthRolloverAmount }
          totalIncome { actualAmount plannedAmount remainingAmount previousMonthRolloverAmount }
        }
        monthlyAmountsByCategory {
          category { id name }
          monthlyAmounts { month plannedCashFlowAmount actualAmount remainingAmount }
        }
      }
    }
  `,

  // Cashflow via aggregates
  GET_CASHFLOW: `
    query GetCashflow($filters: TransactionFilterInput) {
      aggregates(filters: $filters) {
        summary {
          sumIncome
          sumExpense
          savings
          savingsRate
          count
          avg
        }
      }
    }
  `,

  GET_CASHFLOW_BY_CATEGORY: `
    query GetCashflowByCategory($filters: TransactionFilterInput) {
      aggregates(filters: $filters, groupBy: ["category"]) {
        groupBy {
          category {
            id
            name
          }
        }
        summary {
          sumIncome
          sumExpense
          count
        }
      }
    }
  `,

  GET_CASHFLOW_BY_MERCHANT: `
    query GetCashflowByMerchant($filters: TransactionFilterInput) {
      aggregates(filters: $filters, groupBy: ["merchant"]) {
        groupBy {
          merchant {
            id
            name
          }
        }
        summary {
          sumIncome
          sumExpense
          count
        }
      }
    }
  `,

  // Categories and tags
  GET_TRANSACTION_CATEGORIES: `
    query GetTransactionCategories {
      categories {
        id
        name
        icon
        systemCategory
        isSystemCategory
        isDisabled
        order
        group {
          id
          name
          type
        }
      }
    }
  `,

  GET_TRANSACTION_TAGS: `
    query GetTransactionTags {
      householdTransactionTags {
        id
        name
        color
        order
        transactionCount
      }
    }
  `,

  // Recurring items with status grouping and summaries
  GET_RECURRING_TRANSACTIONS: `
    query Common_GetAggregatedRecurringItems($startDate: Date!, $endDate: Date!) {
      aggregatedRecurringItems(startDate: $startDate, endDate: $endDate, groupBy: "status") {
        groups {
          groupBy { status }
          results {
            stream {
              id
              merchant { id name }
              frequency
              amount
              isActive
            }
          }
          summary {
            expense { total }
            income { total }
          }
        }
        aggregatedSummary {
          expense { completed remaining total count pendingAmountCount }
          income { completed remaining total }
        }
      }
    }
  `,

  // Subscription details
  GET_SUBSCRIPTION_DETAILS: `
    query Common_GetSubscriptionDetails {
      subscription {
        id
        paymentSource
        isOnFreeTrial
        hasPremiumEntitlement
        willCancelAtPeriodEnd
        trialEndsAt
      }
    }
  `,

  // Institutions via credentials
  GET_INSTITUTIONS: `
    query GetInstitutions {
      credentials {
        id
        dataProvider
        updateRequired
        institution {
          id
          name
          logo
          status
        }
      }
    }
  `,

  // Account type options
  GET_ACCOUNT_TYPE_OPTIONS: `
    query GetAccountTypeOptions {
      accountTypes {
        name
        display
      }
    }
  `,
};

export const MUTATIONS = {
  // Authentication mutations (login now uses REST endpoint, these are kept for MFA)
  LOGIN: `
    mutation Login($email: String!, $password: String!, $useWebSession: Boolean) {
      login(email: $email, password: $password, useWebSession: $useWebSession) {
        token
        errors {
          message
        }
      }
    }
  `,

  MULTI_FACTOR_AUTH: `
    mutation MultiFactorAuthenticate($email: String!, $password: String!, $token: String!) {
      multiFactorAuthenticate(email: $email, password: $password, token: $token) {
        token
        errors {
          message
        }
      }
    }
  `,

  // Transaction mutations
  CREATE_TRANSACTION: `
    mutation CreateTransaction($input: CreateTransactionInput!) {
      createTransaction(input: $input) {
        transaction {
          id
          amount
          date
          merchant {
            name
          }
          category {
            name
          }
        }
        errors {
          message
        }
      }
    }
  `,

  UPDATE_TRANSACTION: `
    mutation Web_TransactionDrawerUpdateTransaction($input: UpdateTransactionMutationInput!) {
      updateTransaction(input: $input) {
        transaction {
          id
          amount
          pending
          date
          hideFromReports
          needsReview
          notes
          category {
            id
            name
          }
          merchant {
            id
            name
          }
        }
        errors {
          fieldErrors {
            field
            messages
          }
          message
          code
        }
      }
    }
  `,

  DELETE_TRANSACTION: `
    mutation DeleteTransaction($id: UUID!) {
      deleteTransaction(id: $id) {
        deleted
        errors {
          message
        }
      }
    }
  `,

  UPDATE_TRANSACTION_SPLITS: `
    mutation UpdateTransactionSplits($transactionId: UUID!, $splits: [TransactionSplitInput!]!) {
      updateTransactionSplits(transactionId: $transactionId, splits: $splits) {
        splits {
          id
          amount
        }
        errors {
          message
        }
      }
    }
  `,

  // Tag mutations
  CREATE_TRANSACTION_TAG: `
    mutation CreateTransactionTag($name: String!, $color: String) {
      createTag(name: $name, color: $color) {
        tag {
          id
          name
          color
        }
        errors {
          message
        }
      }
    }
  `,

  SET_TRANSACTION_TAGS: `
    mutation SetTransactionTags($transactionId: UUID!, $tagIds: [UUID!]!) {
      setTransactionTags(transactionId: $transactionId, tagIds: $tagIds) {
        transaction {
          id
          tags {
            id
            name
          }
        }
        errors {
          message
        }
      }
    }
  `,

  // Budget mutations - may not work on current API
  SET_BUDGET_AMOUNT: `
    mutation SetBudgetAmount($categoryId: UUID!, $amount: Float!, $date: Date) {
      setBudgetAmount(categoryId: $categoryId, amount: $amount, date: $date) {
        budget {
          category {
            id
            name
          }
          budgetAmount
        }
        errors {
          message
        }
      }
    }
  `,

  // Category mutations
  CREATE_TRANSACTION_CATEGORY: `
    mutation CreateTransactionCategory($name: String!, $groupId: UUID, $icon: String) {
      createCategory(name: $name, groupId: $groupId, icon: $icon) {
        category {
          id
          name
          icon
        }
        errors {
          message
        }
      }
    }
  `,

  DELETE_TRANSACTION_CATEGORY: `
    mutation DeleteTransactionCategory($id: UUID!) {
      deleteCategory(id: $id) {
        deleted
        errors {
          message
        }
      }
    }
  `,

  // Account mutations
  CREATE_MANUAL_ACCOUNT: `
    mutation CreateManualAccount($input: CreateManualAccountInput!) {
      createManualAccount(input: $input) {
        account {
          id
          displayName
          currentBalance
        }
        errors {
          message
        }
      }
    }
  `,

  UPDATE_ACCOUNT: `
    mutation UpdateAccount($id: UUID!, $input: UpdateAccountInput!) {
      updateAccount(id: $id, input: $input) {
        account {
          id
          displayName
          currentBalance
        }
        errors {
          message
        }
      }
    }
  `,

  DELETE_ACCOUNT: `
    mutation DeleteAccount($id: UUID!) {
      deleteAccount(id: $id) {
        deleted
        errors {
          message
        }
      }
    }
  `,

  // Account refresh
  REQUEST_ACCOUNTS_REFRESH: `
    mutation RequestAccountsRefresh($accountIds: [UUID!]) {
      requestAccountsRefresh(accountIds: $accountIds) {
        refreshId
        errors {
          message
        }
      }
    }
  `,
};
