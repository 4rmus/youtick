import type { UploadStep } from '@/lib/types';

export type StepStatus = UploadStep['status'];

export const INITIAL_STEPS: UploadStep[] = [
    { id: 'session', label: 'Wallet & Balance', status: 'pending' },
    { id: 'thumbnail', label: 'Cover Image', status: 'pending' },
    { id: 'encrypt', label: 'Encrypting Video', status: 'pending' },
    { id: 'upload', label: 'Uploading to IPFS', status: 'pending' },
    { id: 'kms', label: 'Storing Encryption Key', status: 'pending' },
    { id: 'mint', label: 'Minting NFT Ticket', status: 'pending' },
    { id: 'storage', label: 'Persistent Storage Order', status: 'pending' },
    { id: 'verify', label: 'Verifying Storage', status: 'pending' },
];

// File size limits (KMS-based flow)
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB for paid
export const MAX_FREE_FILE_SIZE = 100 * 1024 * 1024; // 100MB for free
export const STRICT_SEGMENTED_DELIVERY = true;

export interface UploadState {
    uploading: boolean;
    status: string;
    progress: number;
    steps: UploadStep[];
    retryStep: 'none' | 'sign_auth';
    verifiedStorageFee: string;
    estimatedStorageFee: string;
    payAmount: string;
    storageOrderStatus: 'pending' | 'success' | 'partial' | 'failed' | null;
}

export const initialUploadState: UploadState = {
    uploading: false,
    status: '',
    progress: 0,
    steps: INITIAL_STEPS,
    retryStep: 'none',
    verifiedStorageFee: '0',
    estimatedStorageFee: '0',
    payAmount: '0',
    storageOrderStatus: null,
};

export type UploadAction =
    | { type: 'SET_UPLOADING'; payload: boolean }
    | { type: 'SET_STATUS'; payload: string }
    | { type: 'SET_PROGRESS'; payload: number }
    | { type: 'UPDATE_STEP'; payload: { id: string; status: StepStatus } }
    | { type: 'RESET_STEPS' }
    | { type: 'SET_RETRY_STEP'; payload: 'none' | 'sign_auth' }
    | { type: 'SET_VERIFIED_STORAGE_FEE'; payload: string }
    | { type: 'SET_ESTIMATED_STORAGE_FEE'; payload: string }
    | { type: 'SET_PAY_AMOUNT'; payload: string }
    | { type: 'SET_STORAGE_ORDER_STATUS'; payload: UploadState['storageOrderStatus'] }
    | { type: 'RESET' };

export function uploadReducer(state: UploadState, action: UploadAction): UploadState {
    switch (action.type) {
        case 'SET_UPLOADING':
            return { ...state, uploading: action.payload };
        case 'SET_STATUS':
            return { ...state, status: action.payload };
        case 'SET_PROGRESS':
            return { ...state, progress: action.payload };
        case 'UPDATE_STEP':
            return {
                ...state,
                steps: state.steps.map(step =>
                    step.id === action.payload.id ? { ...step, status: action.payload.status } : step
                ),
            };
        case 'RESET_STEPS':
            return { ...state, steps: INITIAL_STEPS.map(s => ({ ...s })) };
        case 'SET_RETRY_STEP':
            return { ...state, retryStep: action.payload };
        case 'SET_VERIFIED_STORAGE_FEE':
            return { ...state, verifiedStorageFee: action.payload };
        case 'SET_ESTIMATED_STORAGE_FEE':
            return { ...state, estimatedStorageFee: action.payload };
        case 'SET_PAY_AMOUNT':
            return { ...state, payAmount: action.payload };
        case 'SET_STORAGE_ORDER_STATUS':
            return { ...state, storageOrderStatus: action.payload };
        case 'RESET':
            return initialUploadState;
        default:
            return state;
    }
}
