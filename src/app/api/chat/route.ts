import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { searchFlights, formatFlightOffer, getAlternativeDates } from './lib/amadeus';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

function extractFlightParams(message: string): {
  origin: string | null;
  destination: string | null;
  date: string | null;
} {
  const airportMap: { [key: string]: string } = {
    'san francisco': 'SFO',
    'sf': 'SFO',
    'los angeles': 'LAX',
    'la': 'LAX',
    'new york': 'JFK',
    'nyc': 'JFK',
    'miami': 'MIA',
    'chicago': 'ORD',
    'boston': 'BOS',
    'seattle': 'SEA',
    'denver': 'DEN',
    'atlanta': 'ATL',
    'dallas': 'DFW',
    'houston': 'IAH',
    'phoenix': 'PHX',
    'las vegas': 'LAS',
    'orlando': 'MCO',
    'washington': 'DCA',
    'dc': 'DCA',
    'portland': 'PDX',
  };

  const lowerMsg = message.toLowerCase();

  // Try to find city names
  const cityKeys = Object.keys(airportMap);
  let origin: string | null = null;
  let destination: string | null = null;

  for (const city of cityKeys) {
    if (!origin && lowerMsg.includes(city)) origin = city;
    else if (!destination && lowerMsg.includes(city)) destination = city;
  }

  // Fallback: find 3-letter codes
  const codeMatches = message.match(/\b([A-Z]{3})\b/g);
  if (codeMatches) {
    if (!origin) origin = codeMatches[0];
    if (!destination && codeMatches[1]) destination = codeMatches[1];
  }

  // Extract date roughly
  const dateMatch = message.match(/(?:on|in|for)\s+([a-z]+\s*\d{0,2}\s*\d{0,4})/i);
  const date = dateMatch ? dateMatch[1].trim() : null;

  return { origin, destination, date };
}

// Convert city names to airport codes
function cityToAirportCode(city: string): string {
  const airportMap: { [key: string]: string } = {
    'san francisco': 'SFO',
    'sf': 'SFO',
    'los angeles': 'LAX',
    'la': 'LAX',
    'new york': 'JFK',
    'nyc': 'JFK',
    'miami': 'MIA',
    'chicago': 'ORD',
    'boston': 'BOS',
    'seattle': 'SEA',
    'denver': 'DEN',
    'atlanta': 'ATL',
    'dallas': 'DFW',
    'houston': 'IAH',
    'phoenix': 'PHX',
    'las vegas': 'LAS',
    'orlando': 'MCO',
    'washington': 'DCA',
    'dc': 'DCA',
    'portland': 'PDX',
  };

  const normalized = city.toLowerCase().trim();
  return airportMap[normalized] || city.toUpperCase();
}

// Convert relative dates to YYYY-MM-DD format
function parseDate(dateStr: string): string | null {
  const now = new Date();
  const normalized = dateStr.toLowerCase();

  if (normalized.includes('december')) {
    const year = now.getFullYear();
    const month = now.getMonth() >= 11 ? year + 1 : year;
    return `${month}-12-15`;
  }
  
  if (normalized.includes('january')) {
    const year = now.getMonth() >= 0 ? now.getFullYear() + 1 : now.getFullYear();
    return `${year}-01-15`;
  }

  const futureDate = new Date();
  futureDate.setDate(now.getDate() + 30);
  return futureDate.toISOString().split('T')[0];
}

export async function POST(request: NextRequest) {
  console.log('Received chat request');
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

  // Check if this looks like a flight search query
  const flightParams = extractFlightParams(message);
  console.log('Extracted flight parameters:', flightParams);
  let flightData = null;
  let flightSearchPerformed = false;

    if (flightParams.origin && flightParams.destination) {
      console.log('Calling searchFlights with:', {
        origin: flightParams.origin,
        destination: flightParams.destination,
        date: flightParams.date
      });
      flightSearchPerformed = true;
      try {
        const origin = cityToAirportCode(flightParams.origin);
        const destination = cityToAirportCode(flightParams.destination);
        const departureDate = flightParams.date ? parseDate(flightParams.date) : parseDate('30 days');

        if (departureDate) {
          console.log(`Searching flights: ${origin} to ${destination} on ${departureDate}`);
          const flights = await searchFlights({
            originLocationCode: origin,
            destinationLocationCode: destination,
            departureDate: departureDate,
            adults: 1,
            max: 5
          });
          console.log('Amadeus API returned flights:', flights);
          if (flights.length > 0) {
            flightData = flights.slice(0, 3).map(formatFlightOffer);
            console.log('Formatted flight data:', flightData);
          } else {
            console.log('No flights found for this query.');
          }
        }
      } catch (error) {
        console.error('Error searching flights:', error);
      }
    }

  // Get the generative model (Gemini 2.0 Flash)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });


    let concisePrompt = '';
    if (flightSearchPerformed && flightData && flightData.length > 0) {
      const bestFlight = flightData[0];
  concisePrompt = `The best flight I found: ${bestFlight.origin} to ${bestFlight.destination} with ${bestFlight.airlineName} for $${bestFlight.price} ${bestFlight.currency} (${bestFlight.stops} stops, ${bestFlight.duration}).\nWould you like to see more options, filter by direct flights, or search different dates?`;
    } else if (flightSearchPerformed) {
      concisePrompt = `I couldn't find any flights for your query. Would you like to try different dates, airports, or adjust your search?`;
    } else {
      concisePrompt = `Hi! To help you find the best flight deals, could you tell me your origin, destination, and travel date?`;
    }

    return NextResponse.json({ 
      response: concisePrompt,
      flightData: flightSearchPerformed ? flightData : null 
    });

  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate response',
        response: 'Sorry, I encountered an error. Please try again in a moment.' 
      },
      { status: 500 }
    );
  }
}