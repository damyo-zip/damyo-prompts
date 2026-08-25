import hamnimi from "./hamnimi.mjs";
import kongi from "./kongi.mjs";

const accounts = { kongi, hamnimi };

function getAccount(accountKey) {
  const account = accounts[accountKey];
  if (!account) throw new Error(`알 수 없는 account key: ${accountKey}`);
  return account;
}

export { accounts, getAccount };
