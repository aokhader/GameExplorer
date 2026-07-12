import { renderHook } from '@testing-library/react-native';
import { useNetworkState } from 'expo-network';
import { useIsOnline } from '@/lib/useIsOnline';

jest.mock('expo-network', () => ({ useNetworkState: jest.fn() }));

const mockNetworkState = useNetworkState as jest.Mock;

describe('useIsOnline', () => {
  it('is online when connected and reachable', () => {
    mockNetworkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
    expect(renderHook(() => useIsOnline()).result.current).toBe(true);
  });

  it('is offline when disconnected', () => {
    mockNetworkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    expect(renderHook(() => useIsOnline()).result.current).toBe(false);
  });

  it('is offline when connected but the internet is unreachable', () => {
    mockNetworkState.mockReturnValue({ isConnected: true, isInternetReachable: false });
    expect(renderHook(() => useIsOnline()).result.current).toBe(false);
  });

  it('treats an unknown state as online (never block on a false negative)', () => {
    mockNetworkState.mockReturnValue({});
    expect(renderHook(() => useIsOnline()).result.current).toBe(true);
  });
});
