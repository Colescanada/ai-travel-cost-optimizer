// Airline code to name mapping (add more as needed)
const airlineNames: { [code: string]: string } = {
  'AA': 'American Airlines',
  'DL': 'Delta Air Lines',
  'UA': 'United Airlines',
  'WN': 'Southwest Airlines',
  'AS': 'Alaska Airlines',
  'B6': 'JetBlue Airways',
  'F9': 'Frontier Airlines',
  'NK': 'Spirit Airlines',
  'AC': 'Air Canada',
  'AF': 'Air France',
  'BA': 'British Airways',
  'LH': 'Lufthansa',
  'KL': 'KLM',
  'QF': 'Qantas',
  'SQ': 'Singapore Airlines',
  'EK': 'Emirates',
  'CX': 'Cathay Pacific',
  'NH': 'ANA',
  'JL': 'Japan Airlines',
  // Add more as needed
};
import axios from 'axios';

interface FlightOffer {
  id: string;
  price: {
    total: string;
    currency: string;
  };
  itineraries: Array<{
    segments: Array<{
      departure: {
        iataCode: string;
        at: string;
      };
      arrival: {
        iataCode: string;
        at: string;
      };
      carrierCode: string;
      duration: string;
    }>;
    duration: string;
  }>;
}

interface FlightSearchParams {
  originLocationCode: string;
  destinationLocationCode: string;
  departureDate: string;
  adults: number;
  returnDate?: string;
  max?: number;
}


const BASE_URL = 'https://test.api.amadeus.com';
let accessToken: string | null = null;
let tokenExpiry: number = 0;

// Get OAuth access token
async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) {
  return accessToken!;
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/v1/security/oauth2/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AMADEUS_CLIENT_ID!,
        client_secret: process.env.AMADEUS_CLIENT_SECRET!,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    console.log('Amadeus token response:', response.data);
    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
  return accessToken!;
  } catch (error) {
    if (error instanceof Error && 'response' in error && error.response) {
      // @ts-ignore
      console.error('Error getting Amadeus access token:', error.response.data);
    } else {
      console.error('Error getting Amadeus access token:', error);
    }
    throw new Error('Failed to authenticate with Amadeus API');
  }
}

// Search for flights
export async function searchFlights(params: FlightSearchParams): Promise<FlightOffer[]> {
  try {
    const token = await getAccessToken();
    const searchParams = new URLSearchParams({
      originLocationCode: params.originLocationCode,
      destinationLocationCode: params.destinationLocationCode,
      departureDate: params.departureDate,
      adults: params.adults.toString(),
      max: (params.max || 10).toString(),
    });
    if (params.returnDate) {
      searchParams.append('returnDate', params.returnDate);
    }
  const url = `${BASE_URL}/v2/shopping/flight-offers?${searchParams.toString()}`;
    console.log('Amadeus flight search URL:', url);
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    console.log('Amadeus flight search response:', response.data);
    return response.data.data || [];
  } catch (error) {
    if (error instanceof Error && 'response' in error && error.response) {
      // @ts-ignore
      console.error('Error searching flights:', error.response.data);
    } else {
      console.error('Error searching flights:', error);
    }
    throw new Error('Failed to search flights');
  }
}

// Helper to format ISO 8601 duration (e.g., PT6H44M) to "6h 44m"
function formatDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return isoDuration;
  const hours = match[1] ? `${match[1]}h` : '';
  const minutes = match[2] ? `${match[2]}m` : '';
  return [hours, minutes].filter(Boolean).join(' ').trim();
}


// Helper function to format flight data for display
export async function formatFlightOffer(flight: FlightOffer) {
  const outbound = flight.itineraries[0];
  const firstSegment = outbound.segments[0];
  const lastSegment = outbound.segments[outbound.segments.length - 1];
  const airlineCode = firstSegment.carrierCode;
  const airlineName = airlineNames[airlineCode] || airlineCode;
  const origin = firstSegment.departure.iataCode;
  const destination = lastSegment.arrival.iataCode;
  const departureDate = new Date(firstSegment.departure.at).toISOString().split('T')[0];
  const googleFlightsUrl = `https://www.google.com/flights?hl=en#flt=${origin}.${destination}.${departureDate}`;
  
  const originalPrice = parseFloat(flight.price.total);
  const usdPrice = await convertToUSD(originalPrice, flight.price.currency);
  
  return {
    id: flight.id,
    price: originalPrice,
    priceUSD: Math.round(usdPrice * 100) / 100, // Round to 2 decimal places
    currency: flight.price.currency,
    origin,
    destination,
    departureTime: new Date(firstSegment.departure.at).toISOString(),
    arrivalTime: new Date(lastSegment.arrival.at).toISOString(),
    duration: formatDuration(outbound.duration),
    stops: outbound.segments.length - 1,
    airline: airlineCode,
    airlineName,
    googleFlightsUrl,
  };
}

// Helper to get alternative date suggestions
export async function getAlternativeDates(
  origin: string,
  destination: string,
  baseDate: string,
  daysBefore: number = 3,
  daysAfter: number = 3
): Promise<Array<{date: string, price: number | null}>> {
  const alternatives = [];
  const base = new Date(baseDate);
  
  for (let i = -daysBefore; i <= daysAfter; i++) {
    if (i === 0) continue;
    
    const checkDate = new Date(base);
    checkDate.setDate(base.getDate() + i);
    const dateString = checkDate.toISOString().split('T')[0];
    
    try {
      const flights = await searchFlights({
        originLocationCode: origin,
        destinationLocationCode: destination,
        departureDate: dateString,
        adults: 1,
        max: 1
      });
      
      const cheapestPrice = flights.length > 0 ? parseFloat(flights[0].price.total) : null;
      alternatives.push({
        date: dateString,
        price: cheapestPrice
      });
    } catch (error) {
      alternatives.push({
        date: dateString,
        price: null
      });
    }
  }
  
  return alternatives.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
}



// Currency conversion interface
interface ExchangeRateResponse {
  rates: { [currency: string]: number };
  base: string;
}

// Convert any currency to USD using live exchange rates
async function convertToUSD(amount: number, fromCurrency: string): Promise<number> {
  if (fromCurrency === 'USD') return amount;
  
  try {
    const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/USD`);
    const data: ExchangeRateResponse = response.data;
    
    // Convert from source currency to USD
    const usdRate = 1 / data.rates[fromCurrency];
    return amount * usdRate;
  } catch (error) {
    console.error('Currency conversion error:', error);
    return amount; // Return original amount if conversion fails
  }
}