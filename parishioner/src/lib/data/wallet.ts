import * as mock from '../mock/wallet'
import * as api from '../api/wallet'
import { useApi } from './useApi'

export const fetchWallet = useApi ? api.fetchWallet : mock.fetchWallet
export const addWalletDocumentFile = useApi ? api.addWalletDocumentFile : mock.addWalletDocumentFile
export const addWalletDocumentByUrl = useApi ? api.addWalletDocumentByUrl : mock.addWalletDocumentByUrl
export const deleteWalletDocument = useApi ? api.deleteWalletDocument : mock.deleteWalletDocument
