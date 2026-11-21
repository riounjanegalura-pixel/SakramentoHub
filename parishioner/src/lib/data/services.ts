import * as mock from '../mock/services'
import * as api from '../api/services'
import { useApi } from './useApi'

export const fetchServices = useApi ? api.fetchServices : mock.fetchServices
export const fetchService = useApi ? api.fetchService : mock.fetchService
