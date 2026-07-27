import React from 'react';
import { NotificationPreference } from '@/lib/user/preference-types';

// Mock implementation of MultiStepForm
export const MultiStepForm = ({ steps, onComplete }: any) => (
  <div data-testid="multi-step-form">
    {steps.map((step: any, index: number) => (
      <div key={step.id} data-testid={`step-${step.id}`}>
        <h3>{step.title}</h3>
        <p>{step.description}</p>
        {step.component}
        {index < steps.length - 1 && (
          <button onClick={() => {}} aria-label="Next">
            Next
          </button>
        )}
        {index > 0 && (
          <button onClick={() => {}} aria-label="Back">
            Back
          </button>
        )}
        {index === steps.length - 1 && (
          <button onClick={onComplete} aria-label="Complete">
            Complete
          </button>
        )}
      </div>
    ))}
  </div>
);

// Mock implementation of UserProfileForm
export const UserProfileForm = ({
  fullName,
  jobTitle,
  company,
  bio,
  uiPreferences,
  onNameChange,
  onJobTitleChange,
  onCompanyChange,
  onBioChange,
  onThemeChange,
  onDashboardLayoutChange,
}: any) => (
  <div data-testid="user-profile-form">
    <label htmlFor="fullName">Full Name
      <input
        id="fullName"
        value={fullName}
        onChange={(e) => onNameChange(e.target.value)}
      />
    </label>
    <label htmlFor="jobTitle">Job Title
      <input
        id="jobTitle"
        value={jobTitle}
        onChange={(e) => onJobTitleChange(e.target.value)}
      />
    </label>
    <label htmlFor="company">Company
      <input
        id="company"
        value={company}
        onChange={(e) => onCompanyChange(e.target.value)}
      />
    </label>
    <label htmlFor="bio">Bio
      <textarea
        id="bio"
        value={bio}
        onChange={(e) => onBioChange(e.target.value)}
      />
    </label>
    <fieldset>
      <legend>Theme</legend>
      <label>
        <input
          type="radio"
          name="theme"
          value="light"
          checked={uiPreferences.theme === 'light'}
          onChange={() => onThemeChange('light')}
        />
        Light
      </label>
      <label>
        <input
          type="radio"
          name="theme"
          value="dark"
          checked={uiPreferences.theme === 'dark'}
          onChange={() => onThemeChange('dark')}
        />
        Dark
      </label>
    </fieldset>
  </div>
);

// Mock implementation of TickerSelection
export const TickerSelection = ({
  selectedTickers,
  onAddTicker,
  onRemoveTicker,
}: any) => {
  const [searchText, setSearchText] = React.useState('');

  const handleSearch = () => {
    if (searchText) {
      onAddTicker({
        symbol: searchText,
        companyName: `${searchText} Inc.`,
      });
      setSearchText('');
    }
  };

  return (
    <div data-testid="ticker-selection">
      <input
        placeholder="Search for companies"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
      />
      {searchText && (
        <button onClick={handleSearch} aria-label={`Add ${searchText}`}>
          Add {searchText}
        </button>
      )}
      <div>
        {selectedTickers.map((ticker: any) => (
          <div key={ticker.symbol}>
            {ticker.symbol} - {ticker.companyName}
            <button
              onClick={() => onRemoveTicker(ticker.symbol)}
              aria-label={`Remove ${ticker.symbol}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// Mock implementation of NotificationPreferences
export const NotificationPreferences = ({
  emailFrequency,
  filingTypes,
  contentPreferences,
  onEmailFrequencyChange,
  onFilingTypeChange,
  onContentPreferenceChange,
}: any) => (
  <div data-testid="notification-preferences">
    <fieldset>
      <legend>Email Frequency</legend>
      <label>
        <input
          type="radio"
          name="emailFrequency"
          value="IMMEDIATE"
          checked={emailFrequency === 'IMMEDIATE'}
          onChange={() => onEmailFrequencyChange('IMMEDIATE')}
        />
        Immediate
      </label>
      <label>
        <input
          type="radio"
          name="emailFrequency"
          value="DAILY"
          checked={emailFrequency === 'DAILY'}
          onChange={() => onEmailFrequencyChange('DAILY')}
        />
        Daily Digest
      </label>
    </fieldset>

    <fieldset>
      <legend>Filing Types</legend>
      <label>
        <input
          type="checkbox"
          checked={filingTypes.form10K}
          onChange={() => onFilingTypeChange('form10K', !filingTypes.form10K)}
        />
        10-K Annual Reports
      </label>
      <label>
        <input
          type="checkbox"
          checked={filingTypes.form10Q}
          onChange={() => onFilingTypeChange('form10Q', !filingTypes.form10Q)}
        />
        10-Q Quarterly Reports
      </label>
      <label>
        <input
          type="checkbox"
          checked={filingTypes.form8K}
          onChange={() => onFilingTypeChange('form8K', !filingTypes.form8K)}
        />
        8-K Current Reports
      </label>
    </fieldset>
  </div>
);

// Mock SelectedTicker type
export type SelectedTicker = {
  symbol: string;
  companyName: string;
};

// Setup mocks for the onboarding components
export const setupOnboardingComponentMocks = () => {
  jest.mock('@/components/onboarding/multi-step-form', () => ({
    MultiStepForm,
  }));

  jest.mock('@/components/onboarding/user-profile', () => ({
    UserProfileForm,
  }));

  jest.mock('@/components/onboarding/ticker-selection', () => ({
    TickerSelection,
    SelectedTicker: undefined,
  }));

  jest.mock('@/components/onboarding/notification-preferences', () => ({
    NotificationPreferences,
  }));
}; 