import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppState, QnAPair } from './types';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import * as geminiService from './services/geminiService';
import { MicrophoneIcon, StopIcon, ThinkingIcon, RefreshIcon, CopyIcon, ShareIcon } from './components/Icons';

const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>(AppState.IDLE);
    const [error, setError] = useState<string | null>(null);
    const [storyText, setStoryText] = useState<string>('');
    const [qnaPairs, setQnaPairs] = useState<QnAPair[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
    const [copied, setCopied] = useState(false);
    
    const { startRecording, stopRecording, isRecording } = useAudioRecorder();
    const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const cleanupTimeout = () => {
        if (recordingTimeoutRef.current) {
            clearTimeout(recordingTimeoutRef.current);
            recordingTimeoutRef.current = null;
        }
    };

    const handleReset = () => {
        cleanupTimeout();
        setAppState(AppState.IDLE);
        setError(null);
        setStoryText('');
        setQnaPairs([]);
        setCurrentQuestionIndex(0);
        setCopied(false);
    };
    
    const getShareableText = useCallback(() => {
        let text = `Reading Practice Session!\n\n`;
        text += `--- STORY ---\n`;
        text += `${storyText}\n\n`;
        text += `--- QUESTIONS & ANSWERS ---\n\n`;
        qnaPairs.forEach((pair, index) => {
            text += `Question ${index + 1}: ${pair.question}\n`;
            text += `Answer: ${pair.answer || 'No answer recorded.'}\n\n`;
        });
        return text;
    }, [storyText, qnaPairs]);

    const handleCopyToClipboard = useCallback(() => {
        const textToCopy = getShareableText();
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500); // Reset after 2.5 seconds
        });
    }, [getShareableText]);

    const handleShare = useCallback(async () => {
        const shareData = {
            title: 'Reading Practice Results',
            text: getShareableText(),
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                handleCopyToClipboard();
            }
        } catch (err) {
            console.error("Share failed:", err);
            // Fallback for when sharing is cancelled by the user
            setError("Sharing was cancelled.");
            setTimeout(() => setError(null), 3000);
        }
    }, [getShareableText, handleCopyToClipboard]);

    const handleStartStoryRecording = useCallback(async () => {
        setError(null);
        setAppState(AppState.REQUESTING_PERMISSION);
        try {
            await startRecording();
            setAppState(AppState.RECORDING_STORY);
            recordingTimeoutRef.current = setTimeout(() => {
                handleStopStoryRecording();
            }, 60000); // 60-second limit
        } catch (err) {
            setError((err as Error).message);
            setAppState(AppState.ERROR);
        }
    }, [startRecording]);

    const handleStopStoryRecording = useCallback(async () => {
        cleanupTimeout();
        if (!isRecording) return;
        
        const audioBlob = await stopRecording();
        if (audioBlob) {
            setAppState(AppState.PROCESSING_STORY);
            try {
                const transcription = await geminiService.transcribeAudio(audioBlob);
                setStoryText(transcription);
                
                if(!transcription || transcription.trim().length < 10) {
                     setError("The recording was too short or unclear. Let's try reading again!");
                     setAppState(AppState.ERROR);
                     return;
                }

                const questions = await geminiService.generateComprehensionQuestions(transcription);
                if (questions.length > 0) {
                    setQnaPairs(questions.map(q => ({ question: q, answer: '' })));
                    setAppState(AppState.PRESENTING_QUESTION);
                } else {
                    setError("I couldn't think of any questions for that story. Let's try another one!");
                    setAppState(AppState.ERROR);
                }
            } catch (err) {
                setError((err as Error).message);
                setAppState(AppState.ERROR);
            }
        } else {
           handleReset();
        }
    }, [isRecording, stopRecording]);

    const handleStartAnswerRecording = useCallback(async () => {
        setError(null);
        setAppState(AppState.REQUESTING_PERMISSION);
        try {
            await startRecording();
            setAppState(AppState.RECORDING_ANSWER);
        } catch (err) {
            setError((err as Error).message);
            setAppState(AppState.ERROR);
        }
    }, [startRecording]);

    const handleStopAnswerRecording = useCallback(async () => {
        if (!isRecording) return;

        const audioBlob = await stopRecording();
        if (audioBlob) {
            setAppState(AppState.PROCESSING_ANSWER);
            try {
                const answerText = await geminiService.transcribeAudio(audioBlob);
                setQnaPairs(prev => {
                    const newPairs = [...prev];
                    newPairs[currentQuestionIndex].answer = answerText;
                    return newPairs;
                });

                if (currentQuestionIndex < qnaPairs.length - 1) {
                    setCurrentQuestionIndex(prev => prev + 1);
                    setAppState(AppState.PRESENTING_QUESTION);
                } else {
                    setAppState(AppState.SUMMARY);
                }
            } catch (err) {
                setError((err as Error).message);
                setAppState(AppState.ERROR);
            }
        }
    }, [isRecording, stopRecording, currentQuestionIndex, qnaPairs.length]);
    
    useEffect(() => {
        return () => {
            cleanupTimeout();
        };
    }, []);
    
    const renderContent = () => {
        switch (appState) {
            case AppState.IDLE:
                return (
                    <div className="text-center">
                        <h1 className="text-5xl md:text-7xl font-black text-green-900 mb-2">Reading Buddy</h1>
                        <p className="text-lg text-green-800/80 mb-10">Let's practice reading together! Click the microphone to start.</p>
                        <button onClick={handleStartStoryRecording} className="bg-yellow-400 hover:bg-yellow-500 text-green-900 font-bold text-xl py-4 px-8 rounded-full shadow-lg transition-transform transform hover:scale-105 flex items-center justify-center mx-auto">
                            <MicrophoneIcon className="w-8 h-8 mr-3" />
                            Start Reading
                        </button>
                    </div>
                );
            case AppState.RECORDING_STORY:
                return (
                    <div className="text-center">
                        <h2 className="text-4xl font-bold text-green-900 mb-4 animate-pulse">I'm listening...</h2>
                        <p className="text-green-800/80 mb-8">Read your story out loud. Press stop when you're done!</p>
                        <button onClick={handleStopStoryRecording} className="bg-red-500 hover:bg-red-600 text-white font-bold text-xl py-4 px-8 rounded-full shadow-lg transition-transform transform hover:scale-105 flex items-center justify-center mx-auto">
                            <StopIcon className="w-8 h-8 mr-3" />
                            Stop Reading
                        </button>
                    </div>
                );
            case AppState.PROCESSING_STORY:
                return (
                    <div className="text-center">
                        <ThinkingIcon className="w-16 h-16 mx-auto text-yellow-500 animate-spin mb-4" />
                        <h2 className="text-4xl font-bold text-green-900">Great job!</h2>
                        <p className="text-green-800/80 mt-2">Let me think of some questions about your story...</p>
                    </div>
                );
            case AppState.PRESENTING_QUESTION:
                return (
                    <div className="text-center max-w-3xl mx-auto">
                        <p className="text-xl font-bold text-green-800/80 mb-4">Question {currentQuestionIndex + 1} of {qnaPairs.length}</p>
                        <h2 className="text-3xl md:text-4xl font-bold text-green-900 mb-8 p-6 bg-green-100/50 rounded-lg shadow-inner border border-green-200/50">{qnaPairs[currentQuestionIndex].question}</h2>
                        <button onClick={handleStartAnswerRecording} className="bg-green-600 hover:bg-green-700 text-white font-bold text-lg py-3 px-6 rounded-full shadow-lg transition-transform transform hover:scale-105 flex items-center justify-center mx-auto">
                           <MicrophoneIcon className="w-6 h-6 mr-2" />
                            Answer Question
                        </button>
                    </div>
                );
            case AppState.RECORDING_ANSWER:
                 return (
                    <div className="text-center max-w-3xl mx-auto">
                        <p className="text-xl text-green-800/80 mb-4 animate-pulse font-semibold">Tell me your answer...</p>
                        <h2 className="text-3xl md:text-4xl font-bold text-green-900 mb-8 p-6 bg-green-100/30 rounded-lg shadow-inner">{qnaPairs[currentQuestionIndex].question}</h2>
                        <button onClick={handleStopAnswerRecording} className="bg-red-500 hover:bg-red-600 text-white font-bold text-lg py-3 px-6 rounded-full shadow-lg transition-transform transform hover:scale-105 flex items-center justify-center mx-auto">
                            <StopIcon className="w-6 h-6 mr-2" />
                            I'm Done Answering
                        </button>
                    </div>
                );
            case AppState.PROCESSING_ANSWER:
                return (
                    <div className="text-center">
                        <ThinkingIcon className="w-16 h-16 mx-auto text-green-600 animate-spin mb-4" />
                        <h2 className="text-3xl font-bold text-green-900">Got it!</h2>
                        <p className="text-green-800/80 mt-2">Let's see what's next...</p>
                    </div>
                );
            case AppState.SUMMARY:
                return (
                    <div className="max-w-4xl mx-auto">
                        <h1 className="text-4xl md:text-5xl font-black text-center text-green-900 mb-8">You did an amazing job!</h1>
                        <div className="space-y-6">
                             <div className="bg-yellow-100/50 p-6 rounded-xl shadow-md border border-yellow-200/60">
                                <h2 className="text-2xl font-bold text-yellow-800 mb-3">What You Read</h2>
                                <p className="text-yellow-900/80 leading-relaxed italic">"{storyText}"</p>
                            </div>
                            <div className="bg-green-100/50 p-6 rounded-xl shadow-md border border-green-200/60">
                                <h2 className="text-2xl font-bold text-green-800 mb-4">Your Questions & Answers</h2>
                                <ul className="space-y-4">
                                    {qnaPairs.map((pair, index) => (
                                        <li key={index} className="border-l-4 border-green-300 pl-4">
                                            <p className="font-semibold text-green-900">{pair.question}</p>
                                            <p className="text-green-900/80 italic mt-1">"{pair.answer || 'No answer recorded.'}"</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mt-10">
                            <button onClick={handleReset} className="order-last sm:order-first w-full sm:w-auto bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-5 rounded-full shadow-lg transition-transform transform hover:scale-105 flex items-center justify-center">
                                <RefreshIcon className="w-5 h-5 mr-2" />
                                Start Over
                            </button>
                            {navigator.share && (
                                <button onClick={handleShare} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-5 rounded-full shadow-lg transition-transform transform hover:scale-105 flex items-center justify-center">
                                    <ShareIcon className="w-5 h-5 mr-2" strokeWidth="2.5"/>
                                    Share Results
                                </button>
                            )}
                             <button onClick={handleCopyToClipboard} className="w-full sm:w-auto bg-yellow-400 hover:bg-yellow-500 text-green-900 font-bold py-3 px-5 rounded-full shadow-lg transition-transform transform hover:scale-105 flex items-center justify-center disabled:opacity-75 disabled:cursor-not-allowed" disabled={copied}>
                                <CopyIcon className="w-5 h-5 mr-2" strokeWidth="2.5"/>
                                {copied ? 'Copied!' : 'Copy Results'}
                            </button>
                        </div>
                    </div>
                );
            case AppState.REQUESTING_PERMISSION:
                return (
                     <div className="text-center">
                        <MicrophoneIcon className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                        <h2 className="text-2xl font-bold text-gray-700">Waiting for microphone...</h2>
                        <p className="text-gray-500 mt-2">Please allow microphone access in your browser.</p>
                    </div>
                )
            case AppState.ERROR:
                return (
                    <div className="text-center max-w-md mx-auto bg-orange-100/80 border-l-4 border-orange-500 p-6 rounded-lg shadow-md">
                        <h2 className="text-2xl font-bold text-orange-800 mb-3">Uh oh, a little hiccup!</h2>
                        <p className="text-orange-700 mb-6">{error}</p>
                         <button onClick={handleReset} className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-full shadow-lg transition-transform transform hover:scale-105 flex items-center justify-center mx-auto">
                            <RefreshIcon className="w-6 h-6 mr-2" />
                            Try Again
                        </button>
                    </div>
                );
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 selection:bg-yellow-300/50">
            <main className="w-full max-w-5xl bg-white/70 backdrop-blur-xl rounded-2xl shadow-2xl p-6 sm:p-8 md:p-12 transition-all duration-300 ease-in-out border border-white/30">
                {renderContent()}
            </main>
        </div>
    );
};

export default App;