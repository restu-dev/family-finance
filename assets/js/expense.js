import { mountTransactions } from "./transactions.js";
export const mountExpense = (el, ctx) => mountTransactions(el, ctx, { mode: "expense" });
