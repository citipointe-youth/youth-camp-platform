import type { IPersonRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import type { Person } from '../core/entities/person';
import type { Church, ChurchContact } from '../core/entities/church';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { isCamper, isRegistrant } from '../core/entities/person';
import { canAccessPerson } from './person.service';
import { NotFoundError } from '../core/errors/app-error';
import { maskPhone } from '../utils/mask';

export interface SearchResult {
  camper: Person;
  contacts: MaskedContact[];
}

export interface MaskedContact {
  role: string;
  name: string;
  phone: string; // masked unless revealed
  gender: 'male' | 'female';
  type: 'primary' | 'backup';
  churchId: string;
}

export interface RevealedContact extends MaskedContact {
  phone: string; // unmasked
}

export interface SearchService {
  search(actor: Actor, q: string): Promise<SearchResult[]>;
  resolveContacts(actor: Actor, camperId: string): Promise<MaskedContact[]>;
  revealContact(actor: Actor, camperId: string, contactRole: string): Promise<RevealedContact>;
}

function makeContacts(church: Church, gender: 'male' | 'female'): MaskedContact[] {
  const genderContacts = church.contacts[gender];
  const contacts: MaskedContact[] = [];

  if (genderContacts.primary.name) {
    contacts.push({
      role: `${gender}-primary`,
      name: genderContacts.primary.name,
      phone: maskPhone(genderContacts.primary.phone),
      gender,
      type: 'primary',
      churchId: church.id,
    });
  }
  if (genderContacts.backup.name) {
    contacts.push({
      role: `${gender}-backup`,
      name: genderContacts.backup.name,
      phone: maskPhone(genderContacts.backup.phone),
      gender,
      type: 'backup',
      churchId: church.id,
    });
  }
  return contacts;
}

export function makeSearchService(
  personRepo: IPersonRepository,
  churchRepo: IChurchRepository,
): SearchService {
  async function getContactsForPerson(person: Person): Promise<{ masked: MaskedContact[]; raw: Map<string, ChurchContact & { gender: 'male' | 'female'; type: 'primary' | 'backup' }> }> {
    const church = await churchRepo.findById(person.churchId);
    if (!church) {
      return { masked: [], raw: new Map() };
    }

    const gender = person.gender === 'female' ? 'female' : 'male';
    const oppositeGender = gender === 'male' ? 'female' : 'male';

    const primary = makeContacts(church, gender);
    const contacts: MaskedContact[] = [...primary];

    // Cross-gender fallback: if no same-gender contacts, add opposite
    if (primary.length === 0) {
      contacts.push(...makeContacts(church, oppositeGender));
    }

    const raw = new Map<string, ChurchContact & { gender: 'male' | 'female'; type: 'primary' | 'backup' }>();
    raw.set(`${gender}-primary`, { ...church.contacts[gender].primary, gender, type: 'primary' });
    raw.set(`${gender}-backup`, { ...church.contacts[gender].backup, gender, type: 'backup' });
    raw.set(`${oppositeGender}-primary`, { ...church.contacts[oppositeGender].primary, gender: oppositeGender, type: 'primary' });
    raw.set(`${oppositeGender}-backup`, { ...church.contacts[oppositeGender].backup, gender: oppositeGender, type: 'backup' });

    return { masked: contacts, raw };
  }

  return {
    async search(actor, q) {
      assertCan(actor, 'camper:read');
      const persons = await personRepo.search(q);
      // First-aiders must be able to find ANYONE who is registered — including people who have
      // not yet arrived, or who have signed out/departed — so a medical lookup never fails because
      // of presence state. The SPA red-flags anyone not currently on site. Other roles keep the
      // existing "arrived campers only" search scope.
      const scoped = persons.filter((p) => {
        if (!canAccessPerson(actor, p)) return false;
        if (isCamper(p)) return true;
        return actor.role === 'firstAid' && isRegistrant(p);
      });

      const results: SearchResult[] = [];
      for (const person of scoped) {
        const { masked } = await getContactsForPerson(person);
        results.push({ camper: person, contacts: masked });
      }
      return results;
    },

    async resolveContacts(actor, camperId) {
      assertCan(actor, 'camper:read');
      const person = await personRepo.findById(camperId);
      // Any accessible registered person (not just arrived campers) — so the first-aid card can
      // show the ministry-leader contacts for someone who hasn't checked in yet.
      if (!person) throw new NotFoundError('Camper not found');
      if (!canAccessPerson(actor, person)) {
        throw new NotFoundError('Camper not found');
      }
      const { masked } = await getContactsForPerson(person);
      return masked;
    },

    async revealContact(actor, camperId, contactRole) {
      assertCan(actor, 'camper:read:sensitive');
      const person = await personRepo.findById(camperId);
      if (!person || !isCamper(person)) throw new NotFoundError('Camper not found');
      if (!canAccessPerson(actor, person)) {
        throw new NotFoundError('Camper not found');
      }
      const { masked, raw } = await getContactsForPerson(person);
      const rawContact = raw.get(contactRole);
      if (!rawContact) throw new NotFoundError('Contact role not found');
      const maskedEntry = masked.find((m) => m.role === contactRole);
      if (!maskedEntry) throw new NotFoundError('Contact not available');

      return {
        ...maskedEntry,
        phone: rawContact.phone,
      };
    },
  };
}
