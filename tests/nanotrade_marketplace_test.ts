import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.2/index.ts';
import { assertEquals, assertNotEqual } from 'https://deno.land/std@0.177.0/testing/asserts.ts';

// Type definitions to handle Clarinet response types
interface InnovationDetails {
  owner: string;
  name: string;
  description: string;
  'minimum-price': number;
  status: number;
  'current-highest-bid': number;
  'current-highest-bidder': string | null;
}

interface ListingDetails {
  seller: string;
  'listed-price': number;
  'listing-timestamp': number;
}

interface HighestBid {
  'bid-amount': number;
  bidder: string | null;
}

// Error Codes
const ERR_UNAUTHORIZED = 1000;
const ERR_INNOVATION_NOT_FOUND = 1001;
const ERR_INVALID_LISTING = 1002;
const ERR_BID_TOO_LOW = 1003;
const ERR_LISTING_CLOSED = 1004;

// Status Codes
const STATUS_ACTIVE = 0;
const STATUS_SOLD = 1;
const STATUS_CANCELLED = 2;

// Innovation Listing Tests
Clarinet.test({
  name: "list-innovation: Successfully list a new innovation with valid parameters",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "list-innovation", 
        [
          types.utf8("NanoBot"),
          types.utf8("Advanced nanoscale robotic technology"),
          types.uint(1000)
        ],
        deployer.address
      )
    ]);

    // Verify transaction success
    block.receipts[0].result.expectOk().expectUint(1);

    // Verify innovation details
    const innovationDetails = chain.callReadOnlyFn(
      "nanotrade_marketplace", 
      "get-innovation-details", 
      [types.uint(1)],
      deployer.address
    );
    
    const details = innovationDetails.result.expectSome();
    const tupleDetails = details as {
      "current-highest-bidder": any,
      "owner": string,
      "status": number
    };
    
    assertEquals(tupleDetails["current-highest-bidder"], null);
  }
});

Clarinet.test({
  name: "list-innovation: Reject listing with zero price",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "list-innovation", 
        [
          types.utf8("NanoBot"),
          types.utf8("Advanced nanoscale robotic technology"),
          types.uint(0)
        ],
        deployer.address
      )
    ]);

    // Verify transaction failure
    block.receipts[0].result.expectErr().expectUint(ERR_INVALID_LISTING);
  }
});

// Bidding Mechanism Tests
Clarinet.test({
  name: "place-bid: Successfully place a valid bid on an innovation",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const user1 = accounts.get("wallet_1")!;

    // First, list an innovation
    let block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "list-innovation", 
        [
          types.utf8("NanoBot"),
          types.utf8("Advanced nanoscale robotic technology"),
          types.uint(1000)
        ],
        deployer.address
      )
    ]);

    // Place a bid
    block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "place-bid", 
        [
          types.uint(1),
          types.uint(1500)
        ],
        user1.address
      )
    ]);

    // Verify bid placement
    block.receipts[0].result.expectOk().expectBool(true);

    // Check highest bid details
    const highestBid = chain.callReadOnlyFn(
      "nanotrade_marketplace", 
      "get-highest-bid", 
      [types.uint(1)],
      user1.address
    );
    
    const highestBidResult = highestBid.result as {
      "bid-amount": number,
      "bidder": string | null
    };
    
    assertEquals(highestBidResult["bid-amount"], 1500);
    assertEquals(highestBidResult["bidder"], user1.address);
  }
});

Clarinet.test({
  name: "place-bid: Reject bid below minimum price",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const user1 = accounts.get("wallet_1")!;

    // First, list an innovation
    let block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "list-innovation", 
        [
          types.utf8("NanoBot"),
          types.utf8("Advanced nanoscale robotic technology"),
          types.uint(1000)
        ],
        deployer.address
      )
    ]);

    // Try to place a bid below minimum price
    block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "place-bid", 
        [
          types.uint(1),
          types.uint(500)
        ],
        user1.address
      )
    ]);

    // Verify bid rejection
    block.receipts[0].result.expectErr().expectUint(ERR_BID_TOO_LOW);
  }
});

// Ownership Transfer Tests
Clarinet.test({
  name: "accept-bid: Successfully transfer ownership after highest bid",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const user1 = accounts.get("wallet_1")!;

    // List an innovation
    let block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "list-innovation", 
        [
          types.utf8("NanoBot"),
          types.utf8("Advanced nanoscale robotic technology"),
          types.uint(1000)
        ],
        deployer.address
      )
    ]);

    // Place a bid
    block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "place-bid", 
        [
          types.uint(1),
          types.uint(1500)
        ],
        user1.address
      )
    ]);

    // Accept the bid from the original owner
    block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "accept-bid", 
        [types.uint(1)],
        deployer.address
      )
    ]);

    // Verify bid acceptance
    block.receipts[0].result.expectOk().expectBool(true);

    // Check updated innovation details
    const innovationDetails = chain.callReadOnlyFn(
      "nanotrade_marketplace", 
      "get-innovation-details", 
      [types.uint(1)],
      user1.address
    );
    
    const details = innovationDetails.result.expectSome();
    const tupleDetails = details as {
      "owner": string,
      "status": number
    };
    
    assertEquals(tupleDetails["owner"], user1.address);
    assertEquals(tupleDetails["status"], STATUS_SOLD);
  }
});

// Access Control Tests
Clarinet.test({
  name: "withdraw-listing: Only owner can withdraw a listing",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const user1 = accounts.get("wallet_1")!;

    // List an innovation
    let block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "list-innovation", 
        [
          types.utf8("NanoBot"),
          types.utf8("Advanced nanoscale robotic technology"),
          types.uint(1000)
        ],
        deployer.address
      )
    ]);

    // Try to withdraw listing by non-owner
    block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "withdraw-listing", 
        [types.uint(1)],
        user1.address
      )
    ]);

    // Verify unauthorized access
    block.receipts[0].result.expectErr().expectUint(ERR_UNAUTHORIZED);
  }
});

// Error Handling Tests
Clarinet.test({
  name: "place-bid: Cannot bid on non-existent innovation",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const user1 = accounts.get("wallet_1")!;

    // Try to place bid on non-existent innovation
    const block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "place-bid", 
        [
          types.uint(999),
          types.uint(1500)
        ],
        user1.address
      )
    ]);

    // Verify error for non-existent innovation
    block.receipts[0].result.expectErr().expectUint(ERR_INNOVATION_NOT_FOUND);
  }
});

// Economic Security Tests
Clarinet.test({
  name: "place-bid: Cannot place lower bid after previous higher bid",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const user1 = accounts.get("wallet_1")!;
    const user2 = accounts.get("wallet_2")!;

    // List an innovation
    let block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "list-innovation", 
        [
          types.utf8("NanoBot"),
          types.utf8("Advanced nanoscale robotic technology"),
          types.uint(1000)
        ],
        deployer.address
      )
    ]);

    // First user places a high bid
    block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "place-bid", 
        [
          types.uint(1),
          types.uint(1500)
        ],
        user1.address
      )
    ]);

    // Second user tries to place a lower bid
    block = chain.mineBlock([
      Tx.contractCall(
        "nanotrade_marketplace", 
        "place-bid", 
        [
          types.uint(1),
          types.uint(1200)
        ],
        user2.address
      )
    ]);

    // Verify bid rejection
    block.receipts[0].result.expectErr().expectUint(ERR_BID_TOO_LOW);
  }
});