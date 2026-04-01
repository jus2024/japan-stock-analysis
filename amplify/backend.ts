import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource.js';
import { data } from './data/resource.js';
import { stockPriceFunction } from './functions/stock-price/resource.js';

defineBackend({
  auth,
  data,
  stockPriceFunction,
});
