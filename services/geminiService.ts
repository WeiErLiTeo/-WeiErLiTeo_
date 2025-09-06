/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Modality } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });


// --- Helper Functions ---

/**
 * Creates a fallback prompt to use when the primary one is blocked.
 * @param scene The scene string (e.g., "At a Grand Ball").
 * @returns The fallback prompt string.
 */
function getFallbackPrompt(scene: string): string {
    return `Create an artistic image of the person in this photo. The style should be inspired by the anime 'Violet Evergarden', and the setting is "${scene}". The image should have a painterly, emotional feel, with authentic-looking clothing and background. Ensure the final image is high quality and artistic.`;
}

/**
 * Processes the Gemini API response, extracting the image or throwing an error if none is found.
 * @param response The response from the generateContent call.
 * @returns A data URL string for the generated image.
 */
function processGeminiResponse(response: GenerateContentResponse): string {
    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        return `data:${mimeType};base64,${data}`;
    }

    const textResponse = response.text;
    console.error("API did not return an image. Response:", textResponse);
    throw new Error(`The AI model responded with text instead of an image: "${textResponse || 'No text response received.'}"`);
}

/**
 * Processes a multipart Gemini API response, extracting image and text.
 * @param response The response from the generateContent call.
 * @returns An object containing the image URL and/or text.
 */
function processMultipartGeminiResponse(response: GenerateContentResponse): { imageUrl?: string; text?: string } {
    let imageUrl: string | undefined;
    let text: string | undefined;

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) {
        throw new Error("Invalid response format from AI model.");
    }

    for (const part of parts) {
        if (part.inlineData) {
            const { mimeType, data } = part.inlineData;
            imageUrl = `data:${mimeType};base64,${data}`;
        } else if (part.text) {
            text = part.text;
        }
    }

    if (!imageUrl && !text) {
        // It's possible for the model to just refuse, which comes back as a text part.
        const refusalText = response.text;
        if (refusalText) {
            return { text: refusalText };
        }
        throw new Error("The AI model did not return an image or text.");
    }

    return { imageUrl, text };
}

/**
 * A wrapper for the Gemini API call that includes a retry mechanism for internal server errors.
 * @param imagePart The image part of the request payload.
 * @param textPart The text part of the request payload.
 * @returns The GenerateContentResponse from the API.
 */
async function callGeminiWithRetry(imagePart: object, textPart: object): Promise<GenerateContentResponse> {
    const maxRetries = 3;
    const initialDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: { parts: [imagePart, textPart] },
            });
        } catch (error) {
            console.error(`Error calling Gemini API (Attempt ${attempt}/${maxRetries}):`, error);
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            const isInternalError = errorMessage.includes('"code":500') || errorMessage.includes('INTERNAL');

            if (isInternalError && attempt < maxRetries) {
                const delay = initialDelay * Math.pow(2, attempt - 1);
                console.log(`Internal error detected. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error; // Re-throw if not a retriable error or if max retries are reached.
        }
    }
    // This should be unreachable due to the loop and throw logic above.
    throw new Error("Gemini API call failed after all retries.");
}


/**
 * Generates a styled image from a source image and a prompt.
 * It includes a fallback mechanism for prompts that might be blocked.
 * @param imageDataUrl A data URL string of the source image (e.g., 'data:image/png;base64,...').
 * @param prompt The prompt to guide the image generation.
 * @param scene The specific scene for the image, used for the fallback prompt.
 * @returns A promise that resolves to a base64-encoded image data URL of the generated image.
 */
export async function generateStyledImage(imageDataUrl: string, prompt: string, scene: string): Promise<string> {
  const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
  if (!match) {
    throw new Error("Invalid image data URL format. Expected 'data:image/...;base64,...'");
  }
  const [, mimeType, base64Data] = match;

    const imagePart = {
        inlineData: { mimeType, data: base64Data },
    };

    // --- First attempt with the original prompt ---
    try {
        console.log("Attempting generation with original prompt...");
        const textPart = { text: prompt };
        const response = await callGeminiWithRetry(imagePart, textPart);
        return processGeminiResponse(response);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        const isNoImageError = errorMessage.includes("The AI model responded with text instead of an image");

        if (isNoImageError) {
            console.warn("Original prompt was likely blocked. Trying a fallback prompt.");

            // --- Second attempt with the fallback prompt ---
            try {
                const fallbackPrompt = getFallbackPrompt(scene);
                console.log(`Attempting generation with fallback prompt for ${scene}...`);
                const fallbackTextPart = { text: fallbackPrompt };
                const fallbackResponse = await callGeminiWithRetry(imagePart, fallbackTextPart);
                return processGeminiResponse(fallbackResponse);
            } catch (fallbackError) {
                console.error("Fallback prompt also failed.", fallbackError);
                const finalErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                throw new Error(`The AI model failed with both original and fallback prompts. Last error: ${finalErrorMessage}`);
            }
        } else {
            // This is for other errors, like a final internal server error after retries.
            console.error("An unrecoverable error occurred during image generation.", error);
            throw new Error(`The AI model failed to generate an image. Details: ${errorMessage}`);
        }
    }
}

/**
 * Sends an image and a text prompt to the Gemini model to edit/remix the image.
 * @param imageDataUrl The base image to be edited.
 * @param prompt The user's instruction for the edit.
 * @returns A promise resolving to an object with the new image URL and any accompanying text.
 */
export async function remixImage(imageDataUrl: string, prompt: string): Promise<{ imageUrl?: string; text?: string }> {
    const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
    if (!match) {
        throw new Error("Invalid image data URL format for remix.");
    }
    const [, mimeType, base64Data] = match;

    const imagePart = {
        inlineData: { mimeType, data: base64Data },
    };
    const textPart = { text: prompt };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [imagePart, textPart] },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        return processMultipartGeminiResponse(response);
    } catch (error) {
        console.error("Error calling Gemini API for remix:", error);
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        throw new Error(`The AI model failed to remix the image. Details: ${errorMessage}`);
    }
}