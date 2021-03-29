import React, { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Switch, Route, Link } from "react-router-dom";
import { Alert, Menu } from "antd";
import {
  GlobalOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import "antd/dist/antd.css";
import { JsonRpcProvider, Web3Provider } from "@ethersproject/providers";
import "./styles/App.scss";
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";
import { useUserAddress } from "eth-hooks";
import {
  useContractReader,
  useExchangePrice,
  useGasPrice,
  useUserProvider,
  useContractLoader,
  useTokensProvider,
} from "./hooks";
import { Layout } from "./components";
import { NETWORKS } from "./constants";
import { Transactor } from "./helpers";
import { About, Claim, Tokens } from "./views";
import { BigNumber } from "@ethersproject/bignumber";

const web3Modal = new Web3Modal({
  // network: "mainnet", // optional
  cacheProvider: true, // optional
  providerOptions: {
    walletconnect: {
      package: WalletConnectProvider, // required
      options: {
        infuraId: process.env.REACT_APP_INFURA_PROJECT_ID,
      },
    },
  },
});

const logoutOfWeb3Modal = async () => {
  await web3Modal.clearCachedProvider();
  setTimeout(() => {
    window.location.reload();
  }, 1);
};

const networkName = process.env.REACT_APP_INFURA_NETWORK
  ? process.env.REACT_APP_INFURA_NETWORK
  : "localhost";
const targetNetwork = NETWORKS[networkName];
if (!targetNetwork) {
  throw new Error(`Invalid network name: ${networkName}`);
}

const mainnetProvider = new JsonRpcProvider(
  "https://mainnet.infura.io/v3/" + process.env.REACT_APP_INFURA_PROJECT_ID,
);

const localProviderUrl = targetNetwork.rpcUrl;
const localProviderUrlFromEnv =
  process.env.REACT_APP_PROVIDER && networkName !== "localhost"
    ? process.env.REACT_APP_PROVIDER
    : localProviderUrl;
const localProvider = new JsonRpcProvider(localProviderUrlFromEnv);

function App() {
  const [injectedProvider, setInjectedProvider] = useState();

  const price = useExchangePrice(targetNetwork, mainnetProvider);
  const gasPrice = useGasPrice(targetNetwork, "fast");

  const userProvider = useUserProvider(injectedProvider, localProvider);
  const address = useUserAddress(userProvider);

  const loadWeb3Modal = useCallback(async () => {
    const provider = await web3Modal.connect();
    setInjectedProvider(new Web3Provider(provider));
  }, [setInjectedProvider]);

  useEffect(() => {
    if (web3Modal.cachedProvider) {
      loadWeb3Modal();
    }
  }, [loadWeb3Modal]);

  const contracts = useContractLoader(localProvider);
  const transactor = Transactor(userProvider, gasPrice);

  const [route, setRoute] = useState();
  useEffect(() => {
    setRoute(window.location.pathname);
  }, [setRoute]);

  // TODO(teddywilson) mess begins

  // Shared function to format token result
  const formatTokensResult = result => {
    if (!result || result.length !== 3) {
      return [];
    }
    // Ridiculous hack for array equality
    return JSON.stringify(
      result[0].map(token => {
        return BigNumber.from(token).toNumber();
      }),
    );
  };

  // Fetch my tokens
  // TODO(bingbongle) If bid is accepted, tokens still show up here.
  const myTokensResult = useContractReader(
    contracts,
    "Token",
    "tokensOf",
    [address, 0, 100000, true],
    10000,
    formatTokensResult,
  );
  const myTokens = useTokensProvider(myTokensResult);

  // Fetch discovery tokens
  const discoveryTokensResult = useContractReader(
    contracts,
    "Token",
    "discover",
    [0, 10000, true],
    10000,
    formatTokensResult,
  );
  const discoveryTokens = useTokensProvider(discoveryTokensResult);

  const totalSupply = useContractReader(
    contracts,
    "Token",
    "totalSupply",
    [],
    10000,
    newTotalSupply => {
      return newTotalSupply ? BigNumber.from(newTotalSupply).toNumber() : 0;
    },
  );

  // TODO(teddywilson) mess ends

  return (
    <div className="App">
      <Alert
        message="Wiki Token is still in development and is not yet deployed. Follow us on Twitter for updates 🔜"
        type="warning"
      />
      <Layout
        address={address}
        web3Modal={web3Modal}
        onConnectWallet={loadWeb3Modal}
        onLogout={logoutOfWeb3Modal}
        provider={userProvider}
        price={price}
      >
        <BrowserRouter>
          <Menu style={{ marginBottom: 24 }} selectedKeys={[route]} mode="horizontal">
            <Menu.Item key="/claim" icon={<SearchOutlined />}>
              <Link
                onClick={() => {
                  setRoute("/claim");
                }}
                to="/claim"
              >
                Claim
              </Link>
            </Menu.Item>
            <Menu.Item key="/tokens" icon={<TrophyOutlined />}>
              <Link
                onClick={() => {
                  setRoute("/tokens");
                }}
                to="/tokens"
              >
                My Tokens
              </Link>
            </Menu.Item>
            <Menu.Item key="/discover" icon={<GlobalOutlined />}>
              <Link
                onClick={() => {
                  setRoute("/discover");
                }}
                to="/discover"
              >
                Discover
              </Link>
            </Menu.Item>
            <Menu.Item key="/about" icon={<QuestionCircleOutlined />}>
              <Link
                onClick={() => {
                  setRoute("/about");
                }}
                to="/about"
              />
              About
            </Menu.Item>
          </Menu>
          <Switch>
            <Route exact path={["/about", "/"]}>
              <About totalSupply={totalSupply} />
            </Route>
            <Route exact path="/claim">
              <Claim
                address={address}
                contracts={contracts}
                localProvider={localProvider}
                signer={userProvider.getSigner()}
                transactor={transactor}
                web3Modal={web3Modal}
              />
            </Route>
            <Route path="/tokens">
              <Tokens
                price={price}
                address={address}
                tokens={myTokens}
                web3Modal={web3Modal}
                contracts={contracts}
                transactor={transactor}
                signer={userProvider.getSigner()}
                headerText={
                  myTokens && myTokens.length > 0
                    ? `Right click on a token to accept a bid, or to list it for sale 📈`
                    : `You haven't claimed any tokens... yet 😞`
                }
                walletNotConnectedText="Connect a wallet to claim your first one"
                localProvider={localProvider}
              />
            </Route>
            <Route path="/discover">
              <Tokens
                price={price}
                address={address}
                tokens={discoveryTokens}
                web3Modal={web3Modal}
                contracts={contracts}
                transactor={transactor}
                signer={userProvider.getSigner()}
                headerText={
                  discoveryTokens && discoveryTokens.length > 0
                    ? `Right click on a token to purchase it for full price, or to place a bid 🏦`
                    : `No tokens have been claimed... yet 😞`
                }
                walletNotConnectedText="Connect a wallet to claim the first one"
                localProvider={localProvider}
              />
            </Route>
          </Switch>
        </BrowserRouter>
      </Layout>
    </div>
  );
}

export default App;
