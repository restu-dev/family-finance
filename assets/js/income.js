import { mountTransactions } from "./transactions.js";
export const mountIncome = (el, ctx) => mountTransactions(el, ctx, { mode: "income" });
