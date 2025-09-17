import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

  // Get the generative model (Gemini 2.0 Flash)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Create travel-focused prompt
    const travelPrompt = `
You are an AI travel cost optimization assistant. Your goal is to help users save money on travel by providing smart recommendations, alternative options, and cost-saving tips.

Key responsibilities:
- Help users find cheaper flight options
- Suggest alternative dates, airports, or routes for better prices
- Provide travel cost-saving tips and strategies
- Ask clarifying questions to better understand their travel needs
- Be friendly, helpful, and focused on saving them money

User message: "${message}"

Provide a helpful response focused on travel cost optimization. If they're asking about flights, ask for specific details like departure/arrival cities, dates, and flexibility to provide better recommendations.
    `;

    // Generate response
    const result = await model.generateContent(travelPrompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ response: text });

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