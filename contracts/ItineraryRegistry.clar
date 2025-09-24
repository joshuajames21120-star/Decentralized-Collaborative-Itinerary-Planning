(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-GROUP u101)
(define-constant ERR-INVALID-ITEM u102)
(define-constant ERR-ALREADY-FINALIZED u103)
(define-constant ERR-NOT-FINALIZED u104)
(define-constant ERR-INVALID-VOTE u105)
(define-constant ERR-ITEM-EXISTS u106)
(define-constant ERR-ITEM-NOT-FOUND u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-GROUP-NOT-FOUND u109)
(define-constant ERR-INVALID-DESCRIPTION u110)
(define-constant ERR-INVALID-COST u111)
(define-constant ERR-INVALID-LOCATION u112)
(define-constant ERR-INVALID-CATEGORY u113)
(define-constant ERR-INVALID-PROPOSER u114)
(define-constant ERR-VOTING-CLOSED u115)
(define-constant ERR-MAX-ITEMS-EXCEEDED u116)

(define-data-var next-itinerary-id uint u0)
(define-data-var max-items-per-itinerary uint u50)

(define-map itineraries
  { group-id: uint, itinerary-id: uint }
  {
    items: (list 50 { description: (string-utf8 256), cost: uint, location: (string-utf8 100), category: (string-utf8 50), proposer: principal, approved: bool, timestamp: uint }),
    finalized: bool,
    creation-timestamp: uint,
    creator: principal
  }
)

(define-map item-votes
  { group-id: uint, itinerary-id: uint, item-id: uint }
  { yes-votes: uint, no-votes: uint, voters: (list 50 principal) }
)

(define-map itinerary-by-group
  { group-id: uint }
  { itinerary-id: uint }
)

(define-read-only (get-itinerary (group-id uint) (itinerary-id uint))
  (map-get? itineraries { group-id: group-id, itinerary-id: itinerary-id })
)

(define-read-only (get-item-votes (group-id uint) (itinerary-id uint) (item-id uint))
  (map-get? item-votes { group-id: group-id, itinerary-id: itinerary-id, item-id: item-id })
)

(define-read-only (get-itinerary-id-by-group (group-id uint))
  (map-get? itinerary-by-group { group-id: group-id })
)

(define-read-only (is-itinerary-registered (group-id uint))
  (is-some (map-get? itinerary-by-group { group-id: group-id }))
)

(define-private (validate-description (description (string-utf8 256)))
  (if (and (> (len description) u0) (<= (len description) u256))
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-cost (cost uint))
  (if (> cost u0)
      (ok true)
      (err ERR-INVALID-COST))
)

(define-private (validate-location (location (string-utf8 100)))
  (if (and (> (len location) u0) (<= (len location) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-category (category (string-utf8 50)))
  (if (or (is-eq category u"flight") (is-eq category u"hotel") (is-eq category u"activity") (is-eq category u"transport"))
      (ok true)
      (err ERR-INVALID-CATEGORY))
)

(define-private (validate-proposer (proposer principal))
  (if (not (is-eq proposer 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-PROPOSER))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-public (create-itinerary (group-id uint))
  (let
    (
      (next-id (var-get next-itinerary-id))
      (itinerary-exists (is-itinerary-registered group-id))
    )
    (asserts! (not itinerary-exists) (err ERR-GROUP-NOT-FOUND))
    (try! (validate-proposer tx-sender))
    (map-set itineraries
      { group-id: group-id, itinerary-id: next-id }
      {
        items: (list ),
        finalized: false,
        creation-timestamp: block-height,
        creator: tx-sender
      }
    )
    (map-set itinerary-by-group { group-id: group-id } { itinerary-id: next-id })
    (var-set next-itinerary-id (+ next-id u1))
    (print { event: "itinerary-created", group-id: group-id, itinerary-id: next-id })
    (ok next-id)
  )
)

(define-public (propose-item
  (group-id uint)
  (itinerary-id uint)
  (description (string-utf8 256))
  (cost uint)
  (location (string-utf8 100))
  (category (string-utf8 50))
)
  (let
    (
      (itinerary (map-get? itineraries { group-id: group-id, itinerary-id: itinerary-id }))
    )
    (match itinerary
      itin
      (begin
        (asserts! (not (get finalized itin)) (err ERR-ALREADY-FINALIZED))
        (asserts! (< (len (get items itin)) (var-get max-items-per-itinerary)) (err ERR-MAX-ITEMS-EXCEEDED))
        (try! (validate-description description))
        (try! (validate-cost cost))
        (try! (validate-location location))
        (try! (validate-category category))
        (try! (validate-proposer tx-sender))
        (map-set itineraries
          { group-id: group-id, itinerary-id: itinerary-id }
          {
            items: (unwrap! (as-max-len? (append (get items itin) { description: description, cost: cost, location: location, category: category, proposer: tx-sender, approved: false, timestamp: block-height }) u50) (err ERR-MAX-ITEMS-EXCEEDED)),
            finalized: (get finalized itin),
            creation-timestamp: (get creation-timestamp itin),
            creator: (get creator itin)
          }
        )
        (map-set item-votes
          { group-id: group-id, itinerary-id: itinerary-id, item-id: (len (get items itin)) }
          { yes-votes: u0, no-votes: u0, voters: (list ) }
        )
        (print { event: "item-proposed", group-id: group-id, itinerary-id: itinerary-id, item-id: (len (get items itin)) })
        (ok (len (get items itin)))
      )
      (err ERR-GROUP-NOT-FOUND)
    )
  )
)

(define-public (vote-on-item (group-id uint) (itinerary-id uint) (item-id uint) (vote bool))
  (let
    (
      (itinerary (map-get? itineraries { group-id: group-id, itinerary-id: itinerary-id }))
      (votes (map-get? item-votes { group-id: group-id, itinerary-id: itinerary-id, item-id: item-id }))
    )
    (match itinerary
      itin
      (match votes
        vote-data
        (begin
          (asserts! (not (get finalized itin)) (err ERR-ALREADY-FINALIZED))
          (asserts! (not (is-some (index-of (get voters vote-data) tx-sender))) (err ERR-INVALID-VOTE))
          (try! (validate-proposer tx-sender))
          (map-set item-votes
            { group-id: group-id, itinerary-id: itinerary-id, item-id: item-id }
            {
              yes-votes: (if vote (+ (get yes-votes vote-data) u1) (get yes-votes vote-data)),
              no-votes: (if (not vote) (+ (get no-votes vote-data) u1) (get no-votes vote-data)),
              voters: (unwrap! (as-max-len? (append (get voters vote-data) tx-sender) u50) (err ERR-MAX-ITEMS-EXCEEDED))
            }
          )
          (print { event: "vote-cast", group-id: group-id, itinerary-id: itinerary-id, item-id: item-id, vote: vote })
          (ok true)
        )
        (err ERR-ITEM-NOT-FOUND)
      )
      (err ERR-GROUP-NOT-FOUND)
    )
  )
)

(define-public (finalize-itinerary (group-id uint) (itinerary-id uint))
  (let
    (
      (itinerary (map-get? itineraries { group-id: group-id, itinerary-id: itinerary-id }))
    )
    (match itinerary
      itin
      (begin
        (asserts! (is-eq (get creator itin) tx-sender) (err ERR-NOT-AUTHORIZED))
        (asserts! (not (get finalized itin)) (err ERR-ALREADY-FINALIZED))
        (map-set itineraries
          { group-id: group-id, itinerary-id: itinerary-id }
          {
            items: (get items itin),
            finalized: true,
            creation-timestamp: (get creation-timestamp itin),
            creator: (get creator itin)
          }
        )
        (print { event: "itinerary-finalized", group-id: group-id, itinerary-id: itinerary-id })
        (ok true)
      )
      (err ERR-GROUP-NOT-FOUND)
    )
  )
)