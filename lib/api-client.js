import axios from 'axios';
// Create an axios instance with default config
const apiClient = axios.create({
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000, // 30 seconds
});
// Request interceptor for adding auth token, etc.
apiClient.interceptors.request.use((config) => {
    // Add any request modifications here (auth tokens, etc.)
    return config;
}, (error) => {
    return Promise.reject(error);
});
// Response interceptor for handling errors
apiClient.interceptors.response.use((response) => {
    return response;
}, (error) => {
    // Handle different error statuses or types here
    if (error.response) {
        // Server responded with a status code outside of 2xx range
        console.error('API Error:', error.response.status, error.response.data);
    }
    else if (error.request) {
        // The request was made but no response was received
        console.error('API No Response:', error.request);
    }
    else {
        // Something happened in setting up the request that triggered an Error
        console.error('API Request Error:', error.message);
    }
    return Promise.reject(error);
});
export default apiClient;
export async function fetchData(url, options) {
    try {
        const response = await apiClient.get(url, options);
        return response.data;
    }
    catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
}
export async function postData(url, data, options) {
    try {
        const response = await apiClient.post(url, data, options);
        return response.data;
    }
    catch (error) {
        console.error('Error posting data:', error);
        throw error;
    }
}
