/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { remixImage } from '../services/geminiService';

interface ChatMessage {
    type: 'user' | 'bot';
    text?: string;
    imageUrl?: string;
}

interface RemixModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (scene: string, newImageUrl: string) => void;
    scene: string | null;
    initialImageUrl: string | null;
}

const LoadingSpinner = () => (
    <div className="flex space-x-2 justify-center items-center">
        <span className="sr-only">Loading...</span>
        <div className="h-2 w-2 bg-neutral-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="h-2 w-2 bg-neutral-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="h-2 w-2 bg-neutral-300 rounded-full animate-bounce"></div>
    </div>
);

const RemixModal: React.FC<RemixModalProps> = ({ isOpen, onClose, onSave, scene, initialImageUrl }) => {
    const [currentImage, setCurrentImage] = useState<string | null>(initialImageUrl);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setCurrentImage(initialImageUrl);
        setChatHistory([]);
    }, [initialImageUrl]);
    
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatHistory, isGenerating]);

    if (!scene || !initialImageUrl) return null;

    const handleSend = async () => {
        if (!userInput.trim() || isGenerating || !currentImage) return;

        const prompt = userInput;
        const newHistory: ChatMessage[] = [...chatHistory, { type: 'user', text: prompt }];
        setChatHistory(newHistory);
        setUserInput('');
        setIsGenerating(true);

        try {
            const result = await remixImage(currentImage, prompt);
            const botMessage: ChatMessage = { type: 'bot' };
            if (result.imageUrl) {
                botMessage.imageUrl = result.imageUrl;
                setCurrentImage(result.imageUrl);
            }
            if (result.text) {
                botMessage.text = result.text;
            }
             // Only add bot message if it has content
            if (botMessage.imageUrl || botMessage.text) {
                setChatHistory([...newHistory, botMessage]);
            }
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
            setChatHistory([...newHistory, { type: 'bot', text: `Sorry, I couldn't remix that. ${errorMessage}` }]);
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleSave = () => {
        if (currentImage) {
            onSave(scene, currentImage);
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        className="bg-[#1c1c1c] border border-white/10 rounded-lg w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-white/10">
                            <h2 className="font-playfair text-2xl text-amber-400">Remix: {scene}</h2>
                            <div className="flex items-center gap-4">
                                <button onClick={handleSave} className="font-lato text-lg text-amber-900 bg-amber-400 py-2 px-6 rounded-sm hover:bg-amber-300 transition-colors">
                                    Save & Close
                                </button>
                                <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="flex-grow flex flex-col md:flex-row min-h-0">
                            {/* Image Panel */}
                            <div className="w-full md:w-1/2 p-4 flex items-center justify-center bg-black">
                                {currentImage ? (
                                    <img src={currentImage} alt={`Remixed image for ${scene}`} className="max-w-full max-h-full object-contain rounded-md" />
                                ) : (
                                    <div className="text-neutral-500">Loading Image...</div>
                                )}
                            </div>

                            {/* Chat Panel */}
                            <div className="w-full md:w-1/2 flex flex-col bg-[#111]">
                                <div className="flex-grow p-4 overflow-y-auto space-y-4">
                                    {chatHistory.map((msg, index) => (
                                        <div key={index} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-xs lg:max-w-sm rounded-lg p-3 ${msg.type === 'user' ? 'bg-amber-400 text-black font-medium' : 'bg-neutral-700 text-white'}`}>
                                                {msg.text && <p className="text-sm">{msg.text}</p>}
                                                {msg.imageUrl && <img src={msg.imageUrl} alt="AI generated image" className="rounded-md mt-2" />}
                                            </div>
                                        </div>
                                    ))}
                                    {isGenerating && (
                                        <div className="flex justify-start">
                                            <div className="max-w-xs lg:max-w-sm rounded-lg p-3 bg-neutral-700">
                                                <LoadingSpinner />
                                            </div>
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>
                                <div className="flex-shrink-0 p-4 border-t border-white/10">
                                    <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2 bg-neutral-800 rounded-md p-2">
                                        <input
                                            type="text"
                                            value={userInput}
                                            onChange={(e) => setUserInput(e.target.value)}
                                            placeholder="e.g., add a hat..."
                                            disabled={isGenerating}
                                            className="w-full bg-transparent text-white placeholder-neutral-500 focus:outline-none"
                                        />
                                        <button type="submit" disabled={isGenerating || !userInput.trim()} className="p-2 bg-amber-400 text-black rounded-md disabled:opacity-50 disabled:cursor-not-allowed">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                            </svg>
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default RemixModal;