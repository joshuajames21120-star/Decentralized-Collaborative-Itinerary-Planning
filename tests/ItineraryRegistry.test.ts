import { describe, it, expect, beforeEach } from 'vitest';
import { Cl } from '@stacks/transactions';

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_GROUP = 101;
const ERR_INVALID_ITEM = 102;
const ERR_ALREADY_FINALIZED = 103;
const ERR_NOT_FINALIZED = 104;
const ERR_INVALID_VOTE = 105;
const ERR_ITEM_EXISTS = 106;
const ERR_ITEM_NOT_FOUND = 107;
const ERR_INVALID_TIMESTAMP = 108;
const ERR_GROUP_NOT_FOUND = 109;
const ERR_INVALID_DESCRIPTION = 110;
const ERR_INVALID_COST = 111;
const ERR_INVALID_LOCATION = 112;
const ERR_INVALID_CATEGORY = 113;
const ERR_INVALID_PROPOSER = 114;
const ERR_VOTING_CLOSED = 115;
const ERR_MAX_ITEMS_EXCEEDED = 116;

interface ItineraryItem {
  description: string;
  cost: number;
  location: string;
  category: string;
  proposer: string;
  approved: boolean;
  timestamp: number;
}

interface Itinerary {
  items: ItineraryItem[];
  finalized: boolean;
  creationTimestamp: number;
  creator: string;
}

interface VoteData {
  yesVotes: number;
  noVotes: number;
  voters: string[];
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ItineraryRegistryMock {
  state: {
    nextItineraryId: number;
    maxItemsPerItinerary: number;
    itineraries: Map<string, Itinerary>;
    itemVotes: Map<string, VoteData>;
    itineraryByGroup: Map<number, { itineraryId: number }>;
  } = {
    nextItineraryId: 0,
    maxItemsPerItinerary: 50,
    itineraries: new Map(),
    itemVotes: new Map(),
    itineraryByGroup: new Map(),
  };
  blockHeight: number = 0;
  caller: string = 'ST1TEST';
  authorities: Set<string> = new Set(['ST1TEST']);

  reset(): void {
    this.state = {
      nextItineraryId: 0,
      maxItemsPerItinerary: 50,
      itineraries: new Map(),
      itemVotes: new Map(),
      itineraryByGroup: new Map(),
    };
    this.blockHeight = 0;
    this.caller = 'ST1TEST';
    this.authorities = new Set(['ST1TEST']);
  }

  createItinerary(groupId: number): Result<number> {
    if (this.state.itineraryByGroup.has(groupId)) return { ok: false, value: ERR_GROUP_NOT_FOUND };
    if (this.caller === 'SP000000000000000000002Q6VF78') return { ok: false, value: ERR_INVALID_PROPOSER };
    const itineraryId = this.state.nextItineraryId;
    this.state.itineraries.set(`${groupId}-${itineraryId}`, {
      items: [],
      finalized: false,
      creationTimestamp: this.blockHeight,
      creator: this.caller,
    });
    this.state.itineraryByGroup.set(groupId, { itineraryId });
    this.state.nextItineraryId++;
    return { ok: true, value: itineraryId };
  }

  proposeItem(groupId: number, itineraryId: number, description: string, cost: number, location: string, category: string): Result<number> {
    const itinerary = this.state.itineraries.get(`${groupId}-${itineraryId}`);
    if (!itinerary) return { ok: false, value: ERR_GROUP_NOT_FOUND };
    if (itinerary.finalized) return { ok: false, value: ERR_ALREADY_FINALIZED };
    if (itinerary.items.length >= this.state.maxItemsPerItinerary) return { ok: false, value: ERR_MAX_ITEMS_EXCEEDED };
    if (!description || description.length > 256) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (cost <= 0) return { ok: false, value: ERR_INVALID_COST };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!['flight', 'hotel', 'activity', 'transport'].includes(category)) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (this.caller === 'SP000000000000000000002Q6VF78') return { ok: false, value: ERR_INVALID_PROPOSER };
    const itemId = itinerary.items.length;
    itinerary.items.push({ description, cost, location, category, proposer: this.caller, approved: false, timestamp: this.blockHeight });
    this.state.itineraries.set(`${groupId}-${itineraryId}`, itinerary);
    this.state.itemVotes.set(`${groupId}-${itineraryId}-${itemId}`, { yesVotes: 0, noVotes: 0, voters: [] });
    return { ok: true, value: itemId };
  }

  voteOnItem(groupId: number, itineraryId: number, itemId: number, vote: boolean): Result<boolean> {
    const itinerary = this.state.itineraries.get(`${groupId}-${itineraryId}`);
    if (!itinerary) return { ok: false, value: ERR_GROUP_NOT_FOUND };
    const votes = this.state.itemVotes.get(`${groupId}-${itineraryId}-${itemId}`);
    if (!votes) return { ok: false, value: ERR_ITEM_NOT_FOUND };
    if (itinerary.finalized) return { ok: false, value: ERR_ALREADY_FINALIZED };
    if (votes.voters.includes(this.caller)) return { ok: false, value: ERR_INVALID_VOTE };
    if (this.caller === 'SP000000000000000000002Q6VF78') return { ok: false, value: ERR_INVALID_PROPOSER };
    votes.voters.push(this.caller);
    if (vote) votes.yesVotes++; else votes.noVotes++;
    this.state.itemVotes.set(`${groupId}-${itineraryId}-${itemId}`, votes);
    return { ok: true, value: true };
  }

  finalizeItinerary(groupId: number, itineraryId: number): Result<boolean> {
    const itinerary = this.state.itineraries.get(`${groupId}-${itineraryId}`);
    if (!itinerary) return { ok: false, value: ERR_GROUP_NOT_FOUND };
    if (itinerary.creator !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (itinerary.finalized) return { ok: false, value: ERR_ALREADY_FINALIZED };
    itinerary.finalized = true;
    this.state.itineraries.set(`${groupId}-${itineraryId}`, itinerary);
    return { ok: true, value: true };
  }

  getItinerary(groupId: number, itineraryId: number): Itinerary | null {
    return this.state.itineraries.get(`${groupId}-${itineraryId}`) || null;
  }

  getItemVotes(groupId: number, itineraryId: number, itemId: number): VoteData | null {
    return this.state.itemVotes.get(`${groupId}-${itineraryId}-${itemId}`) || null;
  }

  isItineraryRegistered(groupId: number): Result<boolean> {
    return { ok: true, value: this.state.itineraryByGroup.has(groupId) };
  }
}

describe('ItineraryRegistry', () => {
  let contract: ItineraryRegistryMock;

  beforeEach(() => {
    contract = new ItineraryRegistryMock();
    contract.reset();
  });

  it('creates itinerary successfully', () => {
    const result = contract.createItinerary(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const itinerary = contract.getItinerary(1, 0);
    expect(itinerary).toEqual({ items: [], finalized: false, creationTimestamp: 0, creator: 'ST1TEST' });
    expect(contract.state.itineraryByGroup.get(1)).toEqual({ itineraryId: 0 });
  });

  it('rejects duplicate itinerary for group', () => {
    contract.createItinerary(1);
    const result = contract.createItinerary(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_GROUP_NOT_FOUND);
  });

  it('rejects invalid proposer for itinerary', () => {
    contract.caller = 'SP000000000000000000002Q6VF78';
    const result = contract.createItinerary(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROPOSER);
  });

  it('proposes item successfully', () => {
    contract.createItinerary(1);
    const result = contract.proposeItem(1, 0, 'Flight to Paris', 1000, 'Paris', 'flight');
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const itinerary = contract.getItinerary(1, 0);
    expect(itinerary?.items[0]).toEqual({
      description: 'Flight to Paris',
      cost: 1000,
      location: 'Paris',
      category: 'flight',
      proposer: 'ST1TEST',
      approved: false,
      timestamp: 0,
    });
    const votes = contract.getItemVotes(1, 0, 0);
    expect(votes).toEqual({ yesVotes: 0, noVotes: 0, voters: [] });
  });

  it('rejects item proposal for non-existent itinerary', () => {
    const result = contract.proposeItem(1, 0, 'Flight to Paris', 1000, 'Paris', 'flight');
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_GROUP_NOT_FOUND);
  });

  it('rejects item proposal for finalized itinerary', () => {
    contract.createItinerary(1);
    contract.finalizeItinerary(1, 0);
    const result = contract.proposeItem(1, 0, 'Flight to Paris', 1000, 'Paris', 'flight');
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_FINALIZED);
  });

  it('rejects item with invalid description', () => {
    contract.createItinerary(1);
    const result = contract.proposeItem(1, 0, '', 1000, 'Paris', 'flight');
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DESCRIPTION);
  });

  it('votes on item successfully', () => {
    contract.createItinerary(1);
    contract.proposeItem(1, 0, 'Flight to Paris', 1000, 'Paris', 'flight');
    const result = contract.voteOnItem(1, 0, 0, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const votes = contract.getItemVotes(1, 0, 0);
    expect(votes).toEqual({ yesVotes: 1, noVotes: 0, voters: ['ST1TEST'] });
  });

  it('rejects vote for non-existent item', () => {
    contract.createItinerary(1);
    const result = contract.voteOnItem(1, 0, 0, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ITEM_NOT_FOUND);
  });

  it('rejects duplicate vote', () => {
    contract.createItinerary(1);
    contract.proposeItem(1, 0, 'Flight to Paris', 1000, 'Paris', 'flight');
    contract.voteOnItem(1, 0, 0, true);
    const result = contract.voteOnItem(1, 0, 0, false);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_VOTE);
  });

  it('finalizes itinerary successfully', () => {
    contract.createItinerary(1);
    const result = contract.finalizeItinerary(1, 0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const itinerary = contract.getItinerary(1, 0);
    expect(itinerary?.finalized).toBe(true);
  });

  it('rejects finalize by non-creator', () => {
    contract.createItinerary(1);
    contract.caller = 'ST2FAKE';
    const result = contract.finalizeItinerary(1, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it('rejects finalize for already finalized itinerary', () => {
    contract.createItinerary(1);
    contract.finalizeItinerary(1, 0);
    const result = contract.finalizeItinerary(1, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_FINALIZED);
  });

  it('checks itinerary existence correctly', () => {
    contract.createItinerary(1);
    const result = contract.isItineraryRegistered(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.isItineraryRegistered(2);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it('parses Clarity types correctly', () => {
    const description = Cl.stringUtf8('Flight to Paris');
    const cost = Cl.uint(1000);
    expect(description.value).toBe('Flight to Paris');
    expect(cost.value).toEqual(BigInt(1000));
  });
});