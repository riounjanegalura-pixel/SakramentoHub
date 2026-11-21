import type { Booking } from '../types'

export const BOOKINGS_KEY = 'sakramentohub_mock_bookings'

export function readBookings(): Booking[] {
  const raw = localStorage.getItem(BOOKINGS_KEY)
  return raw ? (JSON.parse(raw) as Booking[]) : []
}

export function writeBookings(bookings: Booking[]): void {
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings))
}
