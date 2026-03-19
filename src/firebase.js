import { initializeApp } from 'firebase/app'
import { getAnalytics, isSupported } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: 'AIzaSyCE2rLqExgRr0csN2nXqQs5iQaepFJ4exU',
  authDomain: 'zeldawarlocks.firebaseapp.com',
  projectId: 'zeldawarlocks',
  storageBucket: 'zeldawarlocks.firebasestorage.app',
  messagingSenderId: '1023012513776',
  appId: '1:1023012513776:web:fd43bc19e9677f35f91f35',
  measurementId: 'G-14FH3R028H',
}

export const app = initializeApp(firebaseConfig)

export async function initAnalytics() {
  if (typeof window === 'undefined') return null
  const supported = await isSupported()
  if (!supported) return null
  return getAnalytics(app)
}
