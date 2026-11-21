import type { CertificateRelationship, CertificateSacrament } from '../../lib/types'

/** The certificate named the way the parishioner knows it. */
export const CERTIFICATE_LABEL: Record<CertificateSacrament, string> = {
  baptism: 'Baptismal certificate',
  confirmation: 'Confirmation certificate',
  wedding: 'Marriage certificate',
  funeral: 'Death certificate',
}

/** The register that holds each record (matches `register` on a register entry). */
export const REGISTER_LABEL: Record<CertificateSacrament, string> = {
  baptism: 'Baptism',
  confirmation: 'Confirmation',
  wedding: 'Marriage',
  funeral: 'Death',
}

export const CERTIFICATE_SACRAMENTS = Object.keys(CERTIFICATE_LABEL) as CertificateSacrament[]

export const RELATIONSHIP_OPTIONS: ReadonlyArray<{ value: CertificateRelationship; label: string }> = [
  { value: 'self', label: 'Myself' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'representative', label: 'Authorised representative' },
]
