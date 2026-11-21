import { CertificatesSection, DocumentsSection, WalletConsentNote } from '../features/wallet/WalletScreen'
import { MyRequestsSection } from '../features/wallet/MyRequestsSection'
import { WebFrame } from './WebFrame'

/**
 * Documents on a desktop: the wallet on the left, certificates and requests on the right. The way to request a
 * certificate copy is carried by the My requests section, so it is not repeated beside it.
 */
export function WebWallet() {
  return (
    <WebFrame width="max-w-6xl">
      <h1 className="mb-5 font-display text-title font-semibold text-navy">Documents</h1>
      <div className="mb-6">
        <WalletConsentNote />
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="min-w-0">
          <DocumentsSection />
        </div>
        <div className="flex min-w-0 flex-col gap-8">
          <CertificatesSection />
          <MyRequestsSection />
        </div>
      </div>
    </WebFrame>
  )
}
