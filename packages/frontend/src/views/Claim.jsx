import React, { useState, useEffect } from "react";

import "antd/dist/antd.css";
import { Alert, Button, Form, Input } from "antd";
import axios from "axios";
import { BigNumber } from "@ethersproject/bignumber";

import { Token } from "../components";
import { useContractReader } from "../hooks";

// Form validation status
const VALIDATE_STATUS_IDLE = "idle";
const VALIDATE_STATUS_SUCCESS = "success";
const VALIDATE_STATUS_VALIDATING = "validating";
const VALIDATE_STATUS_ERROR = "error";

export default function Claim({
  address,
  contracts,
  localProvider,
  signer,
  transactor,
  web3Modal,
}) {
  console.log("claim!");
  const [validateStatus, setValidateStatus] = useState("");
  const [articleQueryResponse, setArticleQueryResponse] = useState("");
  const [currentPageId, setCurrentPageId] = useState(BigNumber.from(0));
  const [isClaiming, setIsClaiming] = useState(false);
  const isClaimed = useContractReader(contracts, "Token", "isClaimed", [currentPageId], 100000);
  let cancelRequest;

  useEffect(() => {
    setCurrentPageId(
      BigNumber.from(
        articleQueryResponse && articleQueryResponse.pageId ? articleQueryResponse.pageId : 0,
      ),
    );
  }, [articleQueryResponse]);

  const fetchArticleMetadata = async article => {
    cancelRequest && cancelRequest();
    if (!article || article.length === 0) {
      setArticleQueryResponse(null);
      setValidateStatus(VALIDATE_STATUS_IDLE);
      return;
    }
    axios
      .get(`${process.env.REACT_APP_METADATA_API_BASE_URL}/api/article/${article}`, {
        cancelToken: new axios.CancelToken(function executor(canceler) {
          cancelRequest = canceler;
        }),
      })
      .then(response => {
        setArticleQueryResponse(response?.data);
        setValidateStatus(
          response.status === 200 ? VALIDATE_STATUS_SUCCESS : VALIDATE_STATUS_ERROR,
        );
      })
      .catch(error => {
        console.log("Error: ", error);
        setArticleQueryResponse(null);
        setValidateStatus(VALIDATE_STATUS_ERROR);
      });
  };

  const claim = async () => {
    setIsClaiming(true);
    await transactor(contracts["Token"].connect(signer)["mintPage"](currentPageId));
    setIsClaiming(false);
  };

  return (
    <div className="menu-view">
      <Form>
        <Form.Item hasFeedback validateStatus={validateStatus}>
          <Input
            addonBefore="https://en.wikipedia.org/wiki/"
            placeholder="Earth"
            disabled={!web3Modal || !web3Modal.cachedProvider || isClaiming}
            onChange={e => {
              setValidateStatus(VALIDATE_STATUS_VALIDATING);
              fetchArticleMetadata(e.target.value);
            }}
          />
        </Form.Item>
      </Form>
      {/* For whatever reason, style/visibility isn't working for alert so we have to wrap it */}
      <div hidden={web3Modal && web3Modal.cachedProvider}>
        <Alert message="You must connect a wallet in order to claim tokens 😢" type="error" />
      </div>
      <div hidden={validateStatus !== VALIDATE_STATUS_SUCCESS}>
        <Token
          transactor={transactor}
          signer={signer}
          address={address}
          contracts={contracts}
          key={articleQueryResponse?.pageId}
          imageUrl={articleQueryResponse?.imageUrl}
          pageId={articleQueryResponse?.pageId}
          pageTitle={articleQueryResponse?.pageTitle}
          localProvider={localProvider}
        />
        <div hidden={isClaimed}>
          <Button
            loading={isClaiming}
            onClick={() => {
              claim();
            }}
          >
            Claim
          </Button>
        </div>
      </div>
    </div>
  );
}
