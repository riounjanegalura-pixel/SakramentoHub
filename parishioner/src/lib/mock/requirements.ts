import { simulateLatency, simulateFailure, getFailureRate } from './latency'
import type { RequirementDocument, ServiceRequirements, WalletKind } from '../types'

const doc = (
  key: string,
  label: string,
  walletKind: WalletKind,
  requirement: RequirementDocument['requirement'] = 'required',
  condition: string | null = null,
): RequirementDocument => ({ key, label, walletKind, requirement, condition })

function party(x: 'groom' | 'bride'): RequirementDocument[] {
  const who = x === 'groom' ? "Groom's" : "Bride's"
  return [
    doc(`${x}BaptismalCertificate`, `${who} baptismal certificate`, 'baptismal_certificate'),
    doc(`${x}ConfirmationCertificate`, `${who} confirmation certificate`, 'confirmation_certificate'),
    doc(`${x}Cenomar`, `${who} CENOMAR`, 'cenomar'),
    doc(`${x}SpouseDeathCertificate`, `${who} late spouse's death certificate`, 'death_certificate', 'conditional', `Required if the ${x} is widowed`),
    doc(`${x}NullityDecree`, `${who} decree of nullity`, 'other', 'conditional', `Required if the ${x}'s previous marriage was annulled`),
    doc(`${x}Photo`, `${who} 2x2 photo`, 'other', 'optional'),
  ]
}

/** The real catalogue (backend SacramentDocuments::catalogue) for the six services. */
const CATALOGUE: Record<string, RequirementDocument[]> = {
  baptism: [
    doc('birthCertificate', 'PSA birth certificate', 'birth_certificate', 'optional'),
    doc('marriageContract', "Parents' marriage contract", 'marriage_contract', 'optional'),
  ],
  confirmation: [doc('baptismalCertificate', 'Baptismal certificate', 'baptismal_certificate')],
  funeral: [doc('deathCertificate', 'Death certificate', 'death_certificate')],
  wedding: [
    ...party('groom'),
    ...party('bride'),
    doc('marriageLicense', 'Marriage license or Art. 34 affidavit', 'other', 'optional'),
    doc('preCanaCertificate', 'Pre-Cana seminar certificate', 'other', 'optional'),
    doc('bannsCertificate', 'Banns certificate', 'other', 'optional'),
    doc('confessionCertificate', 'Confession certificate', 'other', 'optional'),
  ],
  anointing: [],
  'house-blessing': [],
}

export async function fetchRequirements(serviceId: string): Promise<ServiceRequirements> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to load requirements')
  const documents = CATALOGUE[serviceId]
  if (!documents) throw new Error('Service not found')
  return { serviceId, documents }
}
