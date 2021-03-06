import React, { useEffect, useState } from "react";

import { Alert, Image, Menu, Dropdown } from "antd";
import { BigNumber } from "@ethersproject/bignumber";

import {
  AcceptBidModal,
  ListTokenModal,
  PlaceBidModal,
  PurchaseTokenModal,
  TxHistoryModal,
  UnlistTokenModal,
  WithdrawBidModal,
} from "./modals";
import { FormatAddress } from "../helpers";
import { useWikiTokenContract } from "../hooks";
import { NULL_ADDRESS } from "../constants";

import web3 from "web3";

const KEY_LIST_FOR_SALE = "1";
const KEY_UNLIST_FROM_MARKETPLACE = "2";
const KEY_PURCHASE_FULL_PRICE = "3";
const KEY_PLACE_BID = "4";
const KEY_VIEW_TX_HISTORY = "5";
const KEY_ACCEPT_BID = "6";
const KEY_WITHDRAW_BID = "7";

// TODO(bingbongle) validation, loading spinner, etc.s
// TODO(bingbongle) donation amount
export default function Token({ address, imageUrl, pageId, pageTitle, signer, transactor }) {
  const wikiTokenContract = useWikiTokenContract();

  // Modal state
  // TODO(bingbongle) maybe this could be a single variable with an ID, at this point.
  const [acceptBidModalVisible, setAcceptBidModalVisible] = useState(false);
  const [listTokenModalVisible, setListTokenModalVisible] = useState(false);
  const [purchaseFullPriceModalVisible, setPurchaseFullPriceModalVisible] = useState(false);
  const [placeBidModalVisible, setPlaceBidModalVisible] = useState(false);
  const [txHistoryModalVisible, setTxHistoryModalVisible] = useState(false);
  const [unlistTokenModalVisible, setUnlistTokenModalVisible] = useState(false);
  const [withdrawBidModalVisible, setWithdrawBidModalVisible] = useState(false);

  // Form state
  const [listTokenPriceInEth, setListTokenPriceInEth] = useState("1");
  const [bidPriceInEth, setBidPriceInEth] = useState("1");

  // Tx History events
  const [txHistoryEvents, setTxHistoryEvents] = useState([]);

  // Poll the owner of this token.
  const [owner, setOwner] = useState({});
  const [offer, setOffer] = useState({});
  const [offerDonationAmount, setOfferDonationAmount] = useState();
  const [bid, setBid] = useState({});
  const [bidDonationAmountWei, setBidDonationAmount] = useState();

  useEffect(() => {
    wikiTokenContract.pageIdToAddress(pageId).then(res => setOwner(res));
    wikiTokenContract.pagesOfferedForSale(pageId).then(res => {
      setOffer({
        isForSale: res[0],
        price: web3.utils.fromWei(res.minValue.toString(), "ether"),
        seller: res[2],
      });
    });
    wikiTokenContract.pageBids(pageId).then(res => {
      setBid(
        res
          ? {
              bidder: res.bidder,
              hasBid: res.hasBid,
              value: web3.utils.fromWei(res.value.toString(), "ether"),
            }
          : undefined,
      );
    });
    wikiTokenContract
      .calculateDonationFromValue(
        web3.utils.toWei(offer && offer.price ? offer.price.toString() : "0", "ether"),
      )
      .then(res => setOfferDonationAmount(res));
    wikiTokenContract
      .calculateDonationFromValue(
        web3.utils.toWei(bid && bid.value ? bid.value.toString() : "0", "ether"),
      )
      .then(res => setBidDonationAmount(res));
  }, [pageId]);

  // Creates a Menu.Item for token action menu.
  const menuItem = (key, emoji, emojiText, label) => {
    return (
      <Menu.Item key={key}>
        <span role="img" aria-label={emojiText}>
          {emoji}
        </span>{" "}
        {label}
      </Menu.Item>
    );
  };

  // Builds the right-click menu with user options to interact with token. Varies depending on user
  // and token state.
  const menu = () => {
    if (!offer || !owner || !address || !bid) {
      return <Menu />;
    }
    let items = [];
    if (owner === address) {
      if (offer.isForSale) {
        items.push(menuItem(KEY_UNLIST_FROM_MARKETPLACE, "🛌", "bed", "Unlist from marketplace"));
      } else {
        items.push(menuItem(KEY_LIST_FOR_SALE, "🎉", "party", "List for sale"));
      }
      if (bid.hasBid) {
        items.push(menuItem(KEY_ACCEPT_BID, "❤️", "love", "Accept bid"));
      }
    } else {
      if (offer.isForSale) {
        items.push(menuItem(KEY_PURCHASE_FULL_PRICE, "🔥", "fire", "Purchase for full price"));
      }
      if (owner !== NULL_ADDRESS) {
        if (bid.hasBid && bid.bidder === address) {
          items.push(menuItem(KEY_WITHDRAW_BID, "🥺", "pleading-face", "Withdraw bid"));
        } else {
          items.push(menuItem(KEY_PLACE_BID, "🤠", "cowboy", "Bid on page"));
        }
      }
    }
    items.push(menuItem(KEY_VIEW_TX_HISTORY, "🌐", "globe", "View history"));
    return <Menu onClick={handleMenuClick}>{items}</Menu>;
  };

  /**
   * Fetches and sorts transaction history (by block number and transaction hash) for this page.
   */
  const fetchAndSortTxHistoryEvents = async () => {
    // const mintEvents = await contracts["Token"].queryFilter(
    //   contracts["Token"].filters.Mint(address),
    // );
    // const pageOfferedEvents = await contracts["Token"].queryFilter(
    //   contracts["Token"].filters.PageOffered(BigNumber.from(pageId)),
    // );
    // // TODO(bingbongle) add remaining events
    // const results = mintEvents.concat(pageOfferedEvents);
    // results.sort((a, b) => {
    //   return a.blockNumber === b.blockNumber
    //     ? a.transactionIndex - b.transactionIndex
    //     : a.blockNumber - b.blockNumber;
    // });
    // setTxHistoryEvents(results);
  };

  /**
   * Opens the tokens corresponding Wikipedia. Inteded to be triggered when the
   * image is (left) clicked.
   */
  const openWikipediaPage = () => {
    window.open(`https://en.wikipedia.org/?curid=${pageId}`);
  };

  /**
   * Acceps the outstanding token bid.
   */
  const acceptBid = async () => {
    await wikiTokenContract
      .connect(signer)
      .acceptBidForPage(pageId, web3.utils.toWei(listTokenPriceInEth, "ether"));
  };

  /**
   * Lists the token for sale on the marketplace.
   */
  const listToken = async () => {
    await wikiTokenContract
      .connect(signer)
      .offerPageForSale(pageId, web3.utils.toWei(listTokenPriceInEth, "ether"));
  };

  /**
   * Unlists token from marketplace.
   */
  const unlistToken = async () => {
    await wikiTokenContract.connect(signer).pageNoLongerForSale(pageId);
  };

  /**
   * Purchase token for full price.
   */
  const purchaseForFullPrice = async () => {
    await wikiTokenContract.connect(signer).buyPage(pageId, {
      // TODO(bingbongle): this doesn't work
      value: web3.utils
        .toBN(web3.utils.toWei(offer.price, "ether"))
        .add(web3.utils.toBN(offerDonationAmount.toString()))
        .toString(),
    });
  };

  /**
   * Places a bid against the token.
   */
  const placeBid = async () => {
    await wikiTokenContract.connect(signer).enterBidForPage(pageId, {
      value: web3.utils.toBN(web3.utils.toWei(bidPriceInEth, "ether")).toString(),
    });
  };

  /**
   * Withdraws the current address's bid against this token, assuming the open bid
   * belongs to them.
   */
  const withdrawBid = async () => {
    await wikiTokenContract.connect(signer).withdrawBidForPage(pageId);
  };

  /**
   * Triggered when a right-click menu item is selected.
   * @param {*} event On click event.
   */
  function handleMenuClick(event) {
    switch (event.key) {
      case KEY_ACCEPT_BID:
        setAcceptBidModalVisible(true);
        break;
      case KEY_LIST_FOR_SALE:
        setListTokenModalVisible(true);
        break;
      case KEY_PURCHASE_FULL_PRICE:
        setPurchaseFullPriceModalVisible(true);
        break;
      case KEY_PLACE_BID:
        setPlaceBidModalVisible(true);
        break;
      case KEY_VIEW_TX_HISTORY:
        setTxHistoryModalVisible(true);
        break;
      case KEY_UNLIST_FROM_MARKETPLACE:
        setUnlistTokenModalVisible(true);
        break;
      case KEY_WITHDRAW_BID:
        setWithdrawBidModalVisible(true);
        break;
      default:
        console.log(`Event not handled!`, event);
    }
  }

  // Asynchronously fetch and sort transaction history associated with this token.
  fetchAndSortTxHistoryEvents();

  return (
    <Dropdown overlay={menu()} trigger={["contextMenu"]}>
      <div className="token">
        {offer && offer.isForSale && (
          <Alert message={"💸  " + offer.price + " ETH"} type={"success"} />
        )}
        {bid && bid.hasBid && (
          <Alert message={"Open bid for " + bid.value + " ETH"} type="success" />
        )}
        <div className="token-wrapper">
          <div className="token-image">
            <Image
              width={196}
              src={imageUrl}
              preview={false}
              onClick={() => {
                openWikipediaPage();
              }}
            />
          </div>
          <div className="token-text-box">
            <div className="token-page-title">{`"${pageTitle}"`}</div>
            <div className="token-page-id">{pageId}</div>
          </div>
        </div>
        {owner && address && owner !== NULL_ADDRESS && (
          <div className="token-owner">
            {owner === address ? `😎 You own this token` : FormatAddress(owner)}
          </div>
        )}
        {/* Token action modals */}
        {/* This should be wrapped in some isModalReady property, probably */}
        {bid && bidDonationAmountWei && offerDonationAmount && offer && (
          <div>
            <AcceptBidModal
              value={bid.value}
              donationAmountWei={bidDonationAmountWei}
              pageTitle={pageTitle}
              visible={acceptBidModalVisible}
              onOk={() => {
                setAcceptBidModalVisible(false);
                acceptBid();
              }}
              onCancel={() => {
                setAcceptBidModalVisible(false);
              }}
            />
            <ListTokenModal
              pageTitle={pageTitle}
              visible={listTokenModalVisible}
              onOk={() => {
                setListTokenModalVisible(false);
                listToken();
              }}
              onCancel={() => {
                setListTokenModalVisible(false);
              }}
              onListPriceChange={e => {
                setListTokenPriceInEth(e.toString());
              }}
            />
            <PurchaseTokenModal
              pageTitle={pageTitle}
              offer={offer}
              donationAmount={offerDonationAmount}
              visible={purchaseFullPriceModalVisible}
              onOk={() => {
                setPurchaseFullPriceModalVisible(false);
                purchaseForFullPrice();
              }}
              onCancel={() => {
                setPurchaseFullPriceModalVisible(false);
              }}
            />
            <PlaceBidModal
              pageTitle={pageTitle}
              donationAmount={offerDonationAmount}
              visible={placeBidModalVisible}
              bid={bid}
              onOk={() => {
                placeBid();
                setPlaceBidModalVisible(false);
              }}
              onCancel={() => {
                setPlaceBidModalVisible(false);
              }}
              onBidAmountChanged={e => {
                setBidPriceInEth(e.toString());
              }}
            />
            <TxHistoryModal
              pageTitle={pageTitle}
              visible={txHistoryModalVisible}
              events={txHistoryEvents}
              onOk={() => {
                setTxHistoryModalVisible(false);
              }}
              onCancel={() => {
                setTxHistoryModalVisible(false);
              }}
            />
            <UnlistTokenModal
              pageTitle={pageTitle}
              visible={unlistTokenModalVisible}
              onOk={() => {
                setUnlistTokenModalVisible(false);
                unlistToken();
              }}
              onCancel={() => {
                setListTokenModalVisible(false);
              }}
            />
            <WithdrawBidModal
              pageTitle={pageTitle}
              visible={withdrawBidModalVisible}
              onOk={() => {
                setWithdrawBidModalVisible(false);
                withdrawBid();
              }}
              onCancel={() => {
                setWithdrawBidModalVisible(false);
              }}
            />
          </div>
        )}
      </div>
    </Dropdown>
  );
}
