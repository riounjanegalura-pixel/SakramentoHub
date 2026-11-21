import * as mock from '../mock/requirements'
import * as api from '../api/requirements'
import { useApi } from './useApi'

export const fetchRequirements = useApi ? api.fetchRequirements : mock.fetchRequirements
