import type { ICamperRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import type { Camper } from '../core/entities/camper';
import type { Church, ChurchContact } from '../core/entities/church';
import type { Actor } from '../core/entities/user';
import { assertCan, canAccessCamper } from './access-control';
import { NotFoundError } from '../core/errors/app-error';
import { maskPhone } from '../utils/mask';
import { createLogger } from '../utils/logger';

const logger = createLogger('search');

export interface SearchResult {
  camper: Camper;
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
  camperRepo: ICamperRepository,
  churchRepo: IChurchRepository,
): SearchService {
  async function getContactsForCamper(camper: Camper): Promise<{ masked: MaskedContact[]; raw: Map<string, ChurchContact & { gender: 'male' | 'female'; type: 'primary' | 'backup' }> }> {
    const church = await churchRepo.findById(camper.churchId);
    if (!church) {
      return { masked: [], raw: new Map() };
    }

    const gender = camper.gender === 'female' ? 'female' : 'male';
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
      const campers = await camperRepo.search(q);
      const scoped = campers.filter((c) => canAccessCamper(actor, c));

      const results: SearchResult[] = [];
      for (const camper of scoped) {
        const { masked } = await getContactsForCamper(camper);
        results.push({ camper, contacts: masked });
      }
      return results;
    },

    async resolveContacts(actor, camperId) {
      assertCan(actor, 'camper:read');
      const camper = await camperRepo.findById(camperId);
      if (!camper) throw new NotFoundError('Camper not found');
      if (!canAccessCamper(actor, camper)) {
        throw new NotFoundError('Camper not found');
      }
      const { masked } = await getContactsForCamper(camper);
      return masked;
    },

    async revealContact(actor, camperId, contactRole) {
      assertCan(actor, 'camper:read:sensitive');
      const camper = await camperRepo.findById(camperId);
      if (!camper) throw new NotFoundError('Camper not found');
      if (!canAccessCamper(actor, camper)) {
        throw new NotFoundError('Camper not found');
      }
      const { masked, raw } = await getContactsForCamper(camper);
      const rawContact = raw.get(contactRole);
      if (!rawContact) throw new NotFoundError('Contact role not found');
      const maskedEntry = masked.find((m) => m.role === contactRole);
      if (!maskedEntry) throw new NotFoundError('Contact not available');

      logger.info(`Contact revealed: camper=${camperId} role=${contactRole} by actor=${actor.id}`);

      return {
        ...maskedEntry,
        phone: rawContact.phone,
      };
    },
  };
}
