import axios, { AxiosInstance } from 'axios';
import { authenticator } from 'otplib';
import { QUERIES, MUTATIONS } from './graphql-queries.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export interface MonarchConfig {
  email?: string;
  password?: string;
  mfaSecretKey?: string;
  sessionFile?: string;
  token?: string;
}

interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface LoginResponse {
  login?: {
    token: string;
    errors?: Array<{ message: string }>;
  };
  multiFactorAuthenticate?: {
    token: string;
    errors?: Array<{ message: string }>;
  };
}

export class MonarchClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private sessionFile: string;
  private config: MonarchConfig;
  private deviceId: string;

  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Client-Platform': 'web',
      'device-uuid': this.deviceId,
      'monarch-client': 'monarch-core-web-app-rest',
      'monarch-client-version': 'v1.0.1403',
      'origin': 'https://app.monarch.com',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    };
  }

  constructor(config: MonarchConfig = {}) {
    this.config = config;
    this.sessionFile = config.sessionFile || path.join(os.homedir(), '.monarch_session.json');
    // Use device ID from env, config, or generate a new one
    this.deviceId = process.env.MONARCH_DEVICE_UUID || '';

    // Check for token in config or environment variable
    if (config.token || process.env.MONARCH_TOKEN) {
      this.token = config.token || process.env.MONARCH_TOKEN || null;
    }

    this.client = axios.create({
      baseURL: 'https://api.monarch.com/graphql',
      headers: this.getHeaders(),
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401) {
          this.token = null;
          throw new Error('Authentication failed. Please login again.');
        }
        throw error;
      }
    );
  }

  /**
   * Login with email and password
   */
  async login(email?: string, password?: string, mfaSecretKey?: string): Promise<void> {
    const loginEmail = email || this.config.email;
    const loginPassword = password || this.config.password;
    const mfaKey = mfaSecretKey || this.config.mfaSecretKey;

    if (!loginEmail || !loginPassword) {
      throw new Error('Email and password are required for login');
    }

    // Ensure we have a device ID (generate if not loaded from session)
    if (!this.deviceId) {
      this.deviceId = crypto.randomUUID();
    }

    try {
      // Use the REST login endpoint (not GraphQL)
      const response = await axios.post('https://api.monarch.com/auth/login/', {
        username: loginEmail,
        password: loginPassword,
        supports_mfa: true,
        trusted_device: true,
        supports_email_otp: true,
        supports_recaptcha: true,
      }, {
        headers: this.getHeaders(),
      });

      if (response.data?.token) {
        this.token = response.data.token;
        await this.saveSession();
        return;
      }

      throw new Error('Login failed: No token received');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // 403 means MFA is required
        if (error.response?.status === 403) {
          if (!mfaKey) {
            throw new Error('MFA required. Please provide mfa_secret_key.');
          }
          const mfaToken = authenticator.generate(mfaKey);
          await this.multiFactorAuthenticate(loginEmail, loginPassword, mfaToken);
          return;
        }
        throw new Error(`Login request failed: ${error.response?.data?.detail || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Complete multi-factor authentication
   */
  async multiFactorAuthenticate(email: string, password: string, mfaToken: string): Promise<void> {
    const response = await this.graphqlRequest<LoginResponse>(MUTATIONS.MULTI_FACTOR_AUTH, {
      email,
      password,
      token: mfaToken,
    });

    if (response.multiFactorAuthenticate?.token) {
      this.token = response.multiFactorAuthenticate.token;
      await this.saveSession();
      return;
    }

    if (response.multiFactorAuthenticate?.errors && response.multiFactorAuthenticate.errors.length > 0) {
      throw new Error(response.multiFactorAuthenticate.errors[0].message);
    }

    throw new Error('MFA failed: No token received');
  }

  /**
   * Load saved session from file
   */
  async loadSession(): Promise<boolean> {
    try {
      const data = await fs.readFile(this.sessionFile, 'utf-8');
      const session = JSON.parse(data);

      // Always restore deviceId if available
      if (session.deviceId) {
        this.deviceId = session.deviceId;
      }

      if (session.token && session.expiresAt && new Date(session.expiresAt) > new Date()) {
        this.token = session.token;
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Save current session to file
   */
  async saveSession(): Promise<void> {
    if (!this.token) {
      throw new Error('No active session to save');
    }

    const session = {
      token: this.token,
      deviceId: this.deviceId,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
    };

    await fs.writeFile(this.sessionFile, JSON.stringify(session, null, 2));
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.token !== null;
  }

  /**
   * Make a GraphQL request
   */
  async graphqlRequest<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
    const headers: Record<string, string> = {};
    
    if (this.token) {
      headers['Authorization'] = `Token ${this.token}`;
    }

    try {
      const response = await this.client.post<GraphQLResponse<T>>('', {
        query,
        variables,
      }, { headers });

      if (response.data.errors && response.data.errors.length > 0) {
        throw new Error(response.data.errors.map(e => e.message).join(', '));
      }

      if (!response.data.data) {
        throw new Error('No data received from GraphQL request');
      }

      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`GraphQL request failed: ${error.response?.data?.errors?.[0]?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Ensure client is authenticated
   */
  private ensureAuthenticated(): void {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated. Please login first.');
    }
  }

  // =============================================================================
  // ACCOUNT METHODS
  // =============================================================================

  async getAccounts() {
    this.ensureAuthenticated();
    return this.graphqlRequest(QUERIES.GET_ACCOUNTS);
  }

  async getAccountsSummary(accountType?: string, includeHidden: boolean = false) {
    this.ensureAuthenticated();
    const result = await this.graphqlRequest<{ accounts: any[] }>(QUERIES.GET_ACCOUNTS_SUMMARY);
    let accounts = result.accounts || [];
    if (!includeHidden) {
      accounts = accounts.filter((a: any) => !a.isHidden);
    }
    if (accountType) {
      accounts = accounts.filter((a: any) => a.type?.name === accountType);
    }
    return { accounts };
  }

  async getAccountHistory(accountId?: string, startDate?: string, endDate?: string) {
    this.ensureAuthenticated();
    const filters: Record<string, any> = {};
    if (accountId) filters.accountIds = [accountId];
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    return this.graphqlRequest(QUERIES.GET_ACCOUNT_HISTORY, {
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    });
  }

  async getAccountHoldings(accountId: string) {
    this.ensureAuthenticated();
    return this.graphqlRequest(QUERIES.GET_ACCOUNT_HOLDINGS, {
      input: { accountIds: [accountId] },
    });
  }

  async getAccountTypeOptions() {
    this.ensureAuthenticated();
    return this.graphqlRequest(QUERIES.GET_ACCOUNT_TYPE_OPTIONS);
  }

  async createManualAccount(input: {
    displayName: string;
    type: string;
    subtype?: string;
    currentBalance: number;
    isAsset: boolean;
  }) {
    this.ensureAuthenticated();
    return this.graphqlRequest(MUTATIONS.CREATE_MANUAL_ACCOUNT, { input });
  }

  async updateAccount(id: string, input: {
    displayName?: string;
    currentBalance?: number;
    isHidden?: boolean;
  }) {
    this.ensureAuthenticated();
    return this.graphqlRequest(MUTATIONS.UPDATE_ACCOUNT, { id, input });
  }

  async deleteAccount(id: string) {
    this.ensureAuthenticated();
    return this.graphqlRequest(MUTATIONS.DELETE_ACCOUNT, { id });
  }

  async requestAccountsRefresh(accountIds?: string[]) {
    this.ensureAuthenticated();
    return this.graphqlRequest(MUTATIONS.REQUEST_ACCOUNTS_REFRESH, { accountIds });
  }

  // =============================================================================
  // TRANSACTION METHODS
  // =============================================================================

  async getTransactions(options: {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
    search?: string;
  } = {}) {
    this.ensureAuthenticated();
    const filters: Record<string, any> = {};
    if (options.startDate) filters.startDate = options.startDate;
    if (options.endDate) filters.endDate = options.endDate;
    if (options.search) filters.search = options.search;
    return this.graphqlRequest(QUERIES.GET_TRANSACTIONS, {
      offset: options.offset ?? 0,
      limit: options.limit ?? 100,
      orderBy: 'date',
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    });
  }

  async getTransactionDetails(id: string) {
    this.ensureAuthenticated();
    return this.graphqlRequest(QUERIES.GET_TRANSACTION_DETAILS, { id });
  }

  async getTransactionSplits(transactionId: string) {
    this.ensureAuthenticated();
    return this.graphqlRequest(QUERIES.GET_TRANSACTION_SPLITS, { id: transactionId });
  }

  async getTransactionsSummary(startDate: string, endDate: string) {
    this.ensureAuthenticated();
    return this.graphqlRequest(QUERIES.GET_TRANSACTIONS_SUMMARY, {
      filters: { startDate, endDate },
    });
  }

  async createTransaction(input: {
    amount: number;
    date: string;
    accountId: string;
    merchantName?: string;
    categoryId?: string;
    notes?: string;
  }) {
    this.ensureAuthenticated();
    return this.graphqlRequest(MUTATIONS.CREATE_TRANSACTION, { input });
  }

  async updateTransaction(id: string, input: {
    amount?: number;
    date?: string;
    merchantName?: string;
    categoryId?: string;
    notes?: string;
    hideFromReports?: boolean;
    needsReview?: boolean;
  }) {
    this.ensureAuthenticated();
    // Monarch API expects id inside input, and uses 'category'/'name' field names
    const monarchInput: Record<string, any> = { id };
    if (input.categoryId !== undefined) monarchInput.category = input.categoryId;
    if (input.merchantName !== undefined) monarchInput.name = input.merchantName;
    if (input.amount !== undefined) monarchInput.amount = input.amount;
    if (input.date !== undefined) monarchInput.date = input.date;
    if (input.notes !== undefined) monarchInput.notes = input.notes;
    if (input.hideFromReports !== undefined) monarchInput.hideFromReports = input.hideFromReports;
    if (input.needsReview !== undefined) monarchInput.needsReview = input.needsReview;
    return this.graphqlRequest(MUTATIONS.UPDATE_TRANSACTION, { input: monarchInput });
  }

  async deleteTransaction(id: string) {
    this.ensureAuthenticated();
    return this.graphqlRequest(MUTATIONS.DELETE_TRANSACTION, { id });
  }

  async updateTransactionSplits(transactionId: string, splits: Array<{
    amount: number;
    categoryId?: string;
    merchantName?: string;
    notes?: string;
  }>) {
    this.ensureAuthenticated();
    return this.graphqlRequest(MUTATIONS.UPDATE_TRANSACTION_SPLITS, { transactionId, splits });
  }

  // =============================================================================
  // BUDGET METHODS
  // =============================================================================

  async getBudgets(startDate?: string, endDate?: string) {
    this.ensureAuthenticated();
    // Default to current month
    const now = new Date();
    const start = startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const end = endDate || start;
    return this.graphqlRequest(QUERIES.GET_BUDGETS, { startDate: start, endDate: end });
  }

  async setBudgetAmount(categoryId: string, amount: number, date?: string) {
    this.ensureAuthenticated();
    return this.graphqlRequest(MUTATIONS.SET_BUDGET_AMOUNT, { categoryId, amount, date });
  }

  // =============================================================================
  // CASHFLOW METHODS
  // =============================================================================

  async getCashflow(startDate: string, endDate: string) {
    this.ensureAuthenticated();
    return this.graphqlRequest(QUERIES.GET_CASHFLOW, {
      filters: { startDate, endDate },
    });
  }

  async getCashflowByCategory(startDate: string, endDate: string) {
    this.ensureAuthenticated();
    return this.graphqlRequest(QUERIES.GET_CASHFLOW_BY_CATEGORY, {
      filters: { startDate, endDate },
    });
  }

  async getCashflowByMerchant(startDate: string, endDate: string, limit?: number) {
    this.ensureAuthenticated();
    return this.graphqlRequest(QUERIES.GET_CASHFLOW_BY_MERCHANT, {
      filters: { startDate, endDate },
    });
  }

  // =============================================================================
  // CATEGORY & TAG METHODS
  // =============================================================================

  async getTransactionCategories() {
    this.ensureAuthenticated();
    return this.graphqlRequest(QUERIES.GET_TRANSACTION_CATEGORIES);
  }

  async getTransactionTags() {
    this.ensureAuthenticated();
    return this.graphqlRequest(QUERIES.GET_TRANSACTION_TAGS);
  }

  async createTransactionCategory(name: string, groupId?: string, icon?: string) {
    this.ensureAuthenticated();
    return this.graphqlRequest(MUTATIONS.CREATE_TRANSACTION_CATEGORY, { name, groupId, icon });
  }

  async deleteTransactionCategory(id: string) {
    this.ensureAuthenticated();
    return this.graphqlRequest(MUTATIONS.DELETE_TRANSACTION_CATEGORY, { id });
  }

  async createTransactionTag(name: string, color?: string) {
    this.ensureAuthenticated();
    return this.graphqlRequest(MUTATIONS.CREATE_TRANSACTION_TAG, { name, color });
  }

  async setTransactionTags(transactionId: string, tagIds: string[]) {
    this.ensureAuthenticated();
    return this.graphqlRequest(MUTATIONS.SET_TRANSACTION_TAGS, { transactionId, tagIds });
  }

  // =============================================================================
  // OTHER METHODS
  // =============================================================================

  async getRecurringTransactions() {
    this.ensureAuthenticated();
    // Default to current month
    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
    return this.graphqlRequest(QUERIES.GET_RECURRING_TRANSACTIONS, { startDate, endDate });
  }

  async getSubscriptionDetails() {
    this.ensureAuthenticated();
    return this.graphqlRequest(QUERIES.GET_SUBSCRIPTION_DETAILS);
  }

  async getInstitutions() {
    this.ensureAuthenticated();
    return this.graphqlRequest(QUERIES.GET_INSTITUTIONS);
  }
}
