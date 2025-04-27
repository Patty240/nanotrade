;; NanoTrade Marketplace
;; A secure, decentralized marketplace for nano-scale technology innovations
;; Built on the Stacks blockchain using Clarity

;; Error codes for clear and specific error messaging
(define-constant ERR_UNAUTHORIZED u1000)
(define-constant ERR_INNOVATION_NOT_FOUND u1001)
(define-constant ERR_INVALID_LISTING u1002)
(define-constant ERR_BID_TOO_LOW u1003)
(define-constant ERR_LISTING_CLOSED u1004)
(define-constant ERR_ESCROW_FAILED u1005)

;; Listing status types
(define-constant STATUS_ACTIVE u0)
(define-constant STATUS_SOLD u1)
(define-constant STATUS_CANCELLED u2)

;; Data structures for innovations and marketplace
(define-map innovations 
  {innovation-id: uint}
  {
    owner: principal,
    name: (string-utf8 100),
    description: (string-utf8 500),
    minimum-price: uint,
    status: uint,
    current-highest-bid: uint,
    current-highest-bidder: (optional principal)
  }
)

(define-map listings 
  {innovation-id: uint}
  {
    seller: principal,
    listed-price: uint,
    listing-timestamp: uint
  }
)

(define-map bids
  {innovation-id: uint, bidder: principal}
  {
    bid-amount: uint,
    bid-timestamp: uint
  }
)

;; Track the total number of innovations to generate unique IDs
(define-data-var total-innovations uint u0)

;; Private helper functions for validation and access control
(define-private (is-innovation-owner (innovation-id uint) (sender principal))
  (match (map-get? innovations {innovation-id: innovation-id})
    innovation (is-eq (get owner innovation) sender)
    false
  )
)

(define-private (is-listing-active (innovation-id uint))
  (match (map-get? innovations {innovation-id: innovation-id})
    innovation (is-eq (get status innovation) STATUS_ACTIVE)
    false
  )
)

;; Public functions for marketplace interactions
(define-public (list-innovation 
  (name (string-utf8 100)) 
  (description (string-utf8 500)) 
  (minimum-price uint)
)
  (let 
    (
      (innovation-id (+ (var-get total-innovations) u1))
      (timestamp (get-block-info? time (- block-height u1)))
    )
    ;; Validate input
    (asserts! (> minimum-price u0) (err ERR_INVALID_LISTING))
    
    ;; Create innovation record
    (map-set innovations 
      {innovation-id: innovation-id}
      {
        owner: tx-sender,
        name: name,
        description: description,
        minimum-price: minimum-price,
        status: STATUS_ACTIVE,
        current-highest-bid: u0,
        current-highest-bidder: none
      }
    )
    
    ;; Create listing
    (map-set listings 
      {innovation-id: innovation-id}
      {
        seller: tx-sender,
        listed-price: minimum-price,
        listing-timestamp: (default-to u0 timestamp)
      }
    )
    
    ;; Update total innovations
    (var-set total-innovations innovation-id)
    
    (ok innovation-id)
  )
)

(define-public (place-bid (innovation-id uint) (bid-amount uint))
  (let 
    (
      (innovation (unwrap! (map-get? innovations {innovation-id: innovation-id}) (err ERR_INNOVATION_NOT_FOUND)))
      (current-highest-bid (get current-highest-bid innovation))
      (minimum-price (get minimum-price innovation))
    )
    ;; Validate bid
    (asserts! (is-listing-active innovation-id) (err ERR_LISTING_CLOSED))
    (asserts! (>= bid-amount minimum-price) (err ERR_BID_TOO_LOW))
    (asserts! (> bid-amount current-highest-bid) (err ERR_BID_TOO_LOW))
    
    ;; Record bid
    (map-set bids 
      {innovation-id: innovation-id, bidder: tx-sender}
      {
        bid-amount: bid-amount,
        bid-timestamp: block-height
      }
    )
    
    ;; Update innovation's highest bid
    (map-set innovations 
      {innovation-id: innovation-id}
      (merge innovation {
        current-highest-bid: bid-amount,
        current-highest-bidder: (some tx-sender)
      })
    )
    
    (ok true)
  )
)

(define-public (accept-bid (innovation-id uint))
  (let 
    (
      (innovation (unwrap! (map-get? innovations {innovation-id: innovation-id}) (err ERR_INNOVATION_NOT_FOUND)))
      (highest-bidder (unwrap! (get current-highest-bidder innovation) (err ERR_LISTING_CLOSED)))
      (highest-bid (get current-highest-bid innovation))
    )
    ;; Validate seller authorization
    (asserts! (is-eq tx-sender (get owner innovation)) (err ERR_UNAUTHORIZED))
    (asserts! (is-listing-active innovation-id) (err ERR_LISTING_CLOSED))
    
    ;; Transfer ownership and update status
    (map-set innovations 
      {innovation-id: innovation-id}
      (merge innovation {
        owner: highest-bidder,
        status: STATUS_SOLD,
        current-highest-bid: u0,
        current-highest-bidder: none
      })
    )
    
    ;; TODO: Implement secure STX transfer mechanism
    ;; This is a placeholder and needs actual STX transfer logic
    
    (ok true)
  )
)

(define-public (withdraw-listing (innovation-id uint))
  (begin
    ;; Validate seller authorization
    (asserts! (is-innovation-owner innovation-id tx-sender) (err ERR_UNAUTHORIZED))
    (asserts! (is-listing-active innovation-id) (err ERR_LISTING_CLOSED))
    
    ;; Update innovation status
    (map-set innovations 
      {innovation-id: innovation-id}
      (merge 
        (unwrap! (map-get? innovations {innovation-id: innovation-id}) (err ERR_INNOVATION_NOT_FOUND))
        {status: STATUS_CANCELLED}
      )
    )
    
    (ok true)
  )
)

;; Read-only functions for querying marketplace state
(define-read-only (get-innovation-details (innovation-id uint))
  (map-get? innovations {innovation-id: innovation-id})
)

(define-read-only (get-innovation-listing (innovation-id uint))
  (map-get? listings {innovation-id: innovation-id})
)

(define-read-only (get-highest-bid (innovation-id uint))
  (match (map-get? innovations {innovation-id: innovation-id})
    innovation 
      (tuple 
        (bid-amount (get current-highest-bid innovation))
        (bidder (get current-highest-bidder innovation))
      )
    {bid-amount: u0, bidder: none}
  )
)