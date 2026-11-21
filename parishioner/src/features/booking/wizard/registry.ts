import type { Sacrament } from '../../../lib/types'
import type { WizardDefinition } from './types'
import { houseBlessingWizard } from '../house-blessing/definition'
import { anointingWizard } from '../anointing/definition'
import { funeralWizard } from '../funeral/definition'
import { confirmationWizard } from '../confirmation/definition'
import { baptismWizard } from '../baptism/definition'
import { weddingWizard } from '../wedding/definition'

const WIZARDS: Partial<Record<Sacrament, WizardDefinition>> = {
  'house-blessing': houseBlessingWizard,
  funeral: funeralWizard,
  anointing: anointingWizard,
  confirmation: confirmationWizard,
  baptism: baptismWizard,
  wedding: weddingWizard,
}

export function wizardFor(sacrament: string): WizardDefinition | undefined {
  return WIZARDS[sacrament as Sacrament]
}
