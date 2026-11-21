import * as mock from '../mock/documents'
import * as api from '../api/documents'
import { useApi } from './useApi'

export const uploadDocument = useApi ? api.uploadDocument : mock.uploadDocument
export const fetchDocumentFile = useApi ? api.fetchDocumentFile : mock.fetchDocumentFile
