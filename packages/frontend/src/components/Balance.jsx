import React, { useState } from "react";
import { formatEther } from "@ethersproject/units";
import { usePoller } from "eth-hooks";

const POLL_BALANCE_MS = 30000;

export default function Balance({ address, provider, price }) {
  const [dollarMode, setDollarMode] = useState(true);
  const [balance, setBalance] = useState();

  const getBalance = async () => {
    if (address && provider) {
      try {
        const newBalance = await provider.getBalance(address);
        setBalance(newBalance);
      } catch (e) {
        console.log(e);
      }
    }
  };

  usePoller(() => {
    getBalance();
  }, POLL_BALANCE_MS);

  let floatBalance = parseFloat("0.00");
  if (balance !== undefined) {
    const etherBalance = formatEther(balance);
    floatBalance = parseFloat(etherBalance);
  }

  let displayBalance = floatBalance.toFixed(4);

  if (price && dollarMode) {
    displayBalance = "$" + (floatBalance * price).toFixed(2);
  }

  console.log("balance");
  return (
    <span
      className="balance"
      onClick={() => {
        setDollarMode(!dollarMode);
      }}
    >
      {displayBalance}
    </span>
  );
}
