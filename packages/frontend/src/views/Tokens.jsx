import React, { useEffect } from "react";

import axios from "axios";
import { BigNumber } from "@ethersproject/bignumber";
import { Divider, Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";

import { Token } from "../components";

const antIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />;

/**
 * Displays a grid of Wiki Tokens, either that solely belong to the user's address,
 * or owned by any address.
 */
export default class Tokens extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      tokens: [],
      isLoading: true,
    };
  }

  fetchTokens = async () => {
    console.log("yongo");
    this.props.contracts["Token"]
      .queryFilter(this.props.contracts["Token"].filters.Mint(this.props.address), 0, "latest")
      .then(tokens => {
        console.log("snoopy: ", tokens);
        Promise.all(
          tokens.map(token => {
            const id = BigNumber.from(token["data"]).toNumber(token);
            console.log("tokensEventId", id);
            return axios
              .get(`${process.env.REACT_APP_METADATA_API_BASE_URL}/api/token/${id}`)
              .then(res => res.data);
          }),
        ).then(tokens => {
          this.setState({ tokens: tokens, isLoading: false });
        });
      });
  };

  componentDidMount() {
    this.fetchTokens();
  }

  render() {
    return (
      <div className="menu-view">
        <Spin indicator={antIcon} hidden={this.state.isLoading === false} />
        {!this.state.isLoading && (
          <div>
            <div>{this.props?.headerText}</div>
            <div hidden={this.props?.web3Modal && this.props?.web3Modal.cachedProvider}>
              <Divider />
              {this.props?.walletNotConnectedText.concat(" ")}
              <span role="img" aria-label="rocket">
                🚀
              </span>
            </div>
            <div hidden={!this.state.tokens || this.state.tokens.length === 0}>
              {this.state.tokens.map(token => {
                return (
                  <Token
                    transactor={this.props?.transactor}
                    signer={this.props?.signer}
                    address={this.props?.address}
                    contracts={this.props?.contracts}
                    localProvider={this.props?.localProvider}
                    key={token.properties?.name?.description}
                    imageUrl={token.properties?.image?.description}
                    pageTitle={token.properties?.description?.description}
                    pageId={token.properties?.name?.description}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }
}
