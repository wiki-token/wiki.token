// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.7.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "hardhat/console.sol";

/// TODO(bingbongle) leave comment outlining project/mechanism.
/// @author The Wiki Token team.
/// @title Wiki Token ERC 721 contract.
contract Token is ERC721, Ownable {
    /// The maximum price that a token can be offered for or bidded on.
    /// This is calculated by: ((2^256) - 1) / 100
    /// Since we need to multiply prices by a percentage to yield donation amount, and the
    /// max percentage is 100, we need padding for this operation otherwise it will overflow.
    uint constant MAX_PRICE = 1157920892373161954235709850086879078532699846656405640394575840079131296399;

    /// Maps a page id to an address.
    mapping (uint => address) public pageIdToAddress;

    /// Maps a page id to its outstanding offer by the seller.
    mapping (uint => Offer) public pagesOfferedForSale;

    /// Maps a page id to the highest outstanding offer.
    mapping (uint => Bid) public pageBids;

    /// Pending funds to be withdrawn for each address.
    mapping (address => uint) public pendingWithdrawals;

    /// Minted page ids in order, used for pagination.
    uint[] private _mintedPageIds;

    /// Percentage of offer minValue, in additional to minValue itself, required to purchase a page.
    /// e.g., 4 => 4%
    /// TODO(bingbongle) We could make this more granular (multiply by N), but maybe it's not worth dealing
    /// gas inflated multiplication + overflow logic.
    uint public _donationPercentage;    

    /// Maps an address to the page ids they own
    mapping (address => uint[]) private _addressToPageIds;    

    /// Represents an offer that a seller has made for a page they own.
    struct Offer {
        /// True if the offer is currently active, false otherwise.
        bool isForSale;

        /// The ID of the page this offer represents.
        uint pageId;

        /// Address of the seller that owns this offer and corresponding page.
        address seller;

        /// The minimum value (in Ether) the seller will accept for the page.
        uint minValue;
    }

    /// Represents a bid that a buys has made against a page another seller owns.
    struct Bid {
        /// True if this bid is currently active, false otherwise.
        bool hasBid;

        /// The ID of the page this bid is being made against.
        uint pageId;

        /// Address of the bidder that has made this bid.
        address bidder;

        /// Amount (in Ether) the bidder has agreed to pay for the corresponding page.
        uint value; 
    }

    //////////////
    /// Events ///
    //////////////
    
    event Mint(address indexed to, uint pageId);
    event PageOffered(uint indexed pageId, uint minValue);
    event PageBidEntered(uint indexed pageId, uint value, address indexed fromAddress);
    event PageBidWithdrawn(uint indexed pageId, uint value, address indexed fromAddress);
    event PageBought(uint indexed pageId, uint value, uint donated, address indexed fromAddress, address indexed toAddress);
    event PageNoLongerForSale(uint indexed pageId);

    /// Wiki Token constructor.
    /// @param baseURI Base URI that will be applied to all tokens.
    constructor (string memory baseURI, uint donationPercentage) public ERC721("WikiToken", "WIKI") {
        setBaseURI(baseURI);
        setDonationPercentage(donationPercentage);
    }

    /// Sets base URI for all tokens.
    /// @param baseURI Base URI that will be set.
    function setBaseURI(string memory baseURI) public onlyOwner {
        _setBaseURI(baseURI);
    }

    /// Sets the donation percentage that will be baked into every marketplace transaction.
    /// @param donationPercentage The donation percentage that will be set.
    function setDonationPercentage(uint donationPercentage) public onlyOwner {
        require (
            donationPercentage > 0 && donationPercentage <= 100,
            "Donation percentage must be greater than 0 and less than or equal to 100"
        );
        _donationPercentage = donationPercentage;
    }

    /// Returns the donation percentage that is currently set.
    function donationPercentage() public view returns (uint) {
        return _donationPercentage;
    }

    /// Check if token for `pageId` is claimed.
    /// @param pageId ID of token in question.
    /// @return True if claimed, false otherwise.
    function isClaimed(uint pageId) public view returns (bool) {
        return _exists(pageId);
    }

    /// Fetches tokens belonging to any address.
    /// @param cursor Index paginated results should start at.
    /// @param howMany How many results should be returned.
    function discover(
        uint cursor,
        uint howMany,
        bool ascending
    ) public view returns (uint[] memory result, uint newCursor, bool reachedEnd) {
        return _paginate(cursor, howMany, ascending, _mintedPageIds);
    }

    /// Fetches tokens belonging to an address.
    /// @param address_ Address that tokens will be queried for.
    /// @param cursor Index paginated results should start at.
    /// @param howMany How many results should be returned.
    /// @dev `cursor` and `howMany` allow us to paginate results.
    function tokensOf(
        address address_,
        uint cursor,
        uint howMany,
        bool ascending
    ) public view returns (uint[] memory result, uint newCursor, bool reachedEnd) {
        return _paginate(cursor, howMany, ascending, _addressToPageIds[address_]);
    }

    /// Mints a Wiki Token.
    /// @param pageId Wikipedia page (by id) that will be minted as a token.
    function mintPage(uint pageId) public {
        _mint(msg.sender, pageId);
        _setTokenURI(pageId, Strings.toString(pageId));

        _addressToPageIds[msg.sender].push(pageId);
        _mintedPageIds.push(pageId);

        pageIdToAddress[pageId] = msg.sender;

        emit Mint(msg.sender, pageId);
    }

    /// Purchases a page for the full offer price (or more).
    /// @param pageId ID of the page being purchased.
    function buyPage(uint pageId) public payable {
        Offer memory offer = pagesOfferedForSale[pageId];
        require (offer.isForSale, "Page is not for sale");
        require (
            msg.sender != pageIdToAddress[pageId],
            "Buyer can't repurchase their own pages"
        );
        uint donation = calculateDonationFromValue(offer.minValue);
        require (
            msg.value >= (offer.minValue + donation),
            "Not enough to cover minValue + donation"
        );

        /// Transfer ownership of the page and indicate that it is no longer for sale.
        pageIdToAddress[pageId] = msg.sender;
        pageNoLongerForSale(pageId);

        /// Transfer funds to seller and donation address (owner).
        pendingWithdrawals[offer.seller] += msg.value - donation;
        pendingWithdrawals[owner()] += donation;

        /// Check for the case where there is a bid from the new owner and refund it.
        /// Any other bid can stay in place.
        Bid memory bid = pageBids[pageId];
        if (bid.bidder == msg.sender) {
            // Kill bid and refund value.
            pendingWithdrawals[msg.sender] += bid.value;
            pageBids[pageId] = Bid(false, pageId, address(0), 0);
        }

        emit PageBought(
            pageId,
            msg.value - donation,
            donation,
            offer.seller,
            msg.sender
        );
    }

    /// Allows a seller to indicate that that a page they own is up for purchase.
    /// @param pageId ID of they page that the seller is putting on the market.
    /// @param minSalePriceInWei Minimum sale price the seller will accept for the page.
    function offerPageForSale(uint pageId, uint minSalePriceInWei)  public {
        require (
            pageIdToAddress[pageId] == msg.sender,
            "Page must be owned by sender"
        );
        require (
            minSalePriceInWei <= MAX_PRICE,
            "Min sale price exceeds MAX_PRICE"
        );

        pagesOfferedForSale[pageId] = Offer(
            true,
            pageId,
            msg.sender,
            minSalePriceInWei
        );

        emit PageOffered(pageId, minSalePriceInWei);
    }

    /// Allows a seller to indicate that a page they own is no longer for sale.
    /// @param pageId ID of the page that the seller is taking off the market.
    function pageNoLongerForSale(uint pageId)  public {
        /// Only the owner of the page can take its corresponding offer off the market.
        require (
            pageIdToAddress[pageId] == msg.sender,
            "Page must be owned by sender"
        );

        /// Null out the offer for the corresponding pageId now that it is no longer for sale.
        pagesOfferedForSale[pageId] = Offer(false, pageId, msg.sender, 0);

        emit PageNoLongerForSale(pageId);
    }    

    /// Withdraws pending funds received from bids and purchases.
    function withdrawPendingFunds()  public {
        /// Check how much is currently pending for the sender before clearing the balance.
        uint amount = pendingWithdrawals[msg.sender];

        /// Clear balance to prevent re-entrancy attacks.
        pendingWithdrawals[msg.sender] = 0;

        /// Transfer pending amount back to the sender.
        msg.sender.transfer(amount);
    }

    /// Places a purchasing bid on a page.
    /// @param pageId ID of the page will be placed on.
    function enterBidForPage(uint pageId) public payable  {
        require (
            pageIdToAddress[pageId] != address(0),
            "Page has no owner"
        );
        require (
            pageIdToAddress[pageId] != msg.sender,
            "Bidder already owns this page"
        );
        require (
            msg.value > 0,
            "Bid must be greater than zero"
        );
        require (
            msg.value <= MAX_PRICE,
            "Bid value exceeds MAX_PRICE"
        );

        /// Check if there is already an existing bid for this pageId.
        /// If there is, the new bid should be greater in value.
        Bid memory existing = pageBids[pageId];
        require (
            msg.value > existing.value,
            "Bid value must be greater than outstanding bid value"
        );

        /// If all criteria is met, we can refund the outstanding bid.
        if (existing.value > 0) {
            pendingWithdrawals[existing.bidder] += existing.value;
        }

        /// Replace bid for the pageId, or set it for the first time.
        pageBids[pageId] = Bid(true, pageId, msg.sender, msg.value);

        emit PageBidEntered(pageId, msg.value, msg.sender);
    }

    /// Accepts a bid for a page a seller owns.
    /// @param pageId ID of the page in question.
    /// @param minPrice Minimum price the selleer will accept for the page.
    function acceptBidForPage(uint pageId, uint minPrice)  public {
        require (
            pageIdToAddress[pageId] == msg.sender,
            "Page must be owned by sender"
        );

        Bid memory _bid = pageBids[pageId];
        require (_bid.value > 0, "Bid value must be greater than zero");
        require (
            _bid.value >= minPrice,
            "Bid value must be greater than or equal to minimum price"
        );

        /// Transfer ownership of page offer to bidder and indicate that it is not currently for sale.
        pageIdToAddress[pageId] = _bid.bidder;        
        pagesOfferedForSale[pageId] = Offer(false, pageId, _bid.bidder, 0);

        /// Null out the outstanding bid now that it has been accepted.
        pageBids[pageId] = Bid(false, pageId, address(0), 0);

        /// Calculate donated amount from bid.
        uint256 donation = calculateDonationFromValue(_bid.value);

        /// Transfer funds to owner and donation address (owner).
        pendingWithdrawals[msg.sender] += _bid.value - donation;
        pendingWithdrawals[owner()] += donation;

        emit PageBought(
            pageId,
            _bid.value - donation,
            donation,
            msg.sender,
            _bid.bidder
        );
    }

    /// Withdraws an outstanding bid made against a page.
    /// @param pageId ID of the page the bid is placed against.
    function withdrawBidForPage(uint pageId)  public {
        require (
            pageIdToAddress[pageId] != address(0),
            "Page is not currently owned"
        );
        require (
            pageIdToAddress[pageId] != msg.sender,
            "Page cannot be owned by the sender"
        );

        /// Ensure that the outstanding bid is owned by the sender.
        Bid memory _bid = pageBids[pageId];
        require (
            _bid.bidder == msg.sender,
            "Outstanding bid must be owned by sender"
        );
        
        /// Null out the bid corresponding to the pageId.
        pageBids[pageId] = Bid(false, pageId, address(0), 0);

        /// Refund the bid amount.
        msg.sender.transfer(_bid.value);

        emit PageBidWithdrawn(pageId, _bid.value, msg.sender);        
    }

    /// Helper function to calculate a donation amount from a given value.
    /// @param value Value the donation amount will be derived from.
    /// TODO(bingbongle): Now that this is public it should have a test.
    function calculateDonationFromValue(uint value) public view returns(uint256) {
        bool succeeded;
        uint256 donationTimesOneHundred;
        /// Using `tryMul` as opposed to `mul` is a defense in depth mechanism to safeguard against
        /// overflow. This should never occur since we should always validate prices against MAX_PRICE
        /// before entering this codepath.
        (succeeded, donationTimesOneHundred) = SafeMath.tryMul(
            _donationPercentage,
            value
        );
        if (!succeeded) {
            // TODO(teddywilson) alert, log, etc.
        }
        return donationTimesOneHundred / 100;
    }    

    /// Paginates items in a uint array.
    /// @param cursor Position to start at.
    /// @param howMany Max number of items to return.
    /// @param ascending Index array in ascending/descending order.
    /// @param array Data that will be indexed.
    /// @dev uint Array type could be templated once solidity supports this.
    function _paginate(
        uint cursor,
        uint howMany,
        bool ascending,
        uint[] storage array
    ) private view returns (uint[] memory result, uint newCursor, bool reachedEnd) {
        require (
            cursor < array.length,
            "Cursor position out of bounds"
        );

        /// Determine cursor position depending on length and
        uint cursor_ = cursor;
        uint length = Math.min(howMany, array.length - cursor);
        uint cursorInternal = ascending
            ? cursor
            : array.length - 1 - cursor;
        
        /// Allocate space for the resulting array and push paginated items.
        result = new uint[](length);
        for (uint i = 0; i < length; i++) {
            result[i] = array[cursorInternal];
            if (ascending) {
                cursorInternal++;
            } else {
                cursorInternal--;
            }
            cursor_++;
        }
        
        return (result, cursor_, cursor == array.length);
    }    

}