import { FilingTemplateData } from &apos;../../../../lib/email/types&apos;;

interface Form11KTemplateProps {
  filing: FilingTemplateData;
}

export default function Form11KEmailTemplate({ filing }: Form11KTemplateProps) {
  return (
    <div
      style={{
        fontFamily: &quot;Arial, sans-serif&quot;,
        maxWidth: &quot;600px&quot;,
        margin: &quot;0 auto&quot;,
        backgroundColor: &quot;#ffffff&quot;,
        border: &quot;1px solid #e5e7eb&quot;,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: &quot;linear-gradient(135deg, #667eea 0%, #764ba2 100%)&quot;,
          color: &quot;white&quot;,
          padding: &quot;24px&quot;,
          textAlign: &quot;center&quot; as const,
          borderRadius: &quot;8px 8px 0 0&quot;,
          boxShadow: &quot;0 4px 6px -1px rgba(0, 0, 0, 0.1)&quot;,
        }}
      >
        <h1 style={{ margin: &quot;0 0 8px 0&quot;, fontSize: &quot;24px&quot;, fontWeight: &quot;bold&quot; }}>📊 Form 11-K Filed</h1>
        <p style={{ margin: &quot;0&quot;, fontSize: &quot;16px&quot;, opacity: 0.9 }}>
          Annual Report of Employee Stock Purchase, Savings, and Similar Plans
        </p>
      </div>

      {/* Company Info */}
      <div
        style={{
          padding: &quot;20px&quot;,
          background: &quot;linear-gradient(to right, #f8fafc, #f1f5f9)&quot;,
          borderBottom: &quot;1px solid #e2e8f0&quot;,
          boxShadow: &quot;inset 0 1px 3px rgba(0, 0, 0, 0.1)&quot;,
        }}
      >
        <table style={{ width: &quot;100%&quot;, borderCollapse: &quot;collapse&quot; as const }}>
          <tbody>
            <tr>
              <td style={{ padding: &quot;4px 0&quot;, fontWeight: &quot;bold&quot;, color: &quot;#1f2937&quot; }}>Company:</td>
              <td style={{ padding: &quot;4px 0&quot;, color: &quot;#374151&quot; }}>{filing.companyName}</td>
            </tr>
            <tr>
              <td style={{ padding: &quot;4px 0&quot;, fontWeight: &quot;bold&quot;, color: &quot;#1f2937&quot; }}>Plan Name:</td>
              <td style={{ padding: &quot;4px 0&quot;, color: &quot;#374151&quot; }}>{filing.summaryData?.planName || &apos;N/A&apos;}</td>
            </tr>
            <tr>
              <td style={{ padding: &quot;4px 0&quot;, fontWeight: &quot;bold&quot;, color: &quot;#1f2937&quot; }}>Plan Year:</td>
              <td style={{ padding: &quot;4px 0&quot;, color: &quot;#374151&quot; }}>{filing.summaryData?.planYear || &apos;N/A&apos;}</td>
            </tr>
            <tr>
              <td style={{ padding: &quot;4px 0&quot;, fontWeight: &quot;bold&quot;, color: &quot;#1f2937&quot; }}>Filing Date:</td>
              <td style={{ padding: &quot;4px 0&quot;, color: &quot;#374151&quot; }}>{new Date(filing.filingDate).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td style={{ padding: &quot;4px 0&quot;, fontWeight: &quot;bold&quot;, color: &quot;#1f2937&quot; }}>Total Participants:</td>
              <td style={{ padding: &quot;4px 0&quot;, color: &quot;#374151&quot; }}>{filing.summaryData?.totalParticipants?.toLocaleString() || &apos;N/A&apos;}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Plan Assets Summary */}
      <div
        style={{
          padding: &quot;20px&quot;,
          background: &quot;linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)&quot;,
          borderBottom: &quot;1px solid #e5e7eb&quot;,
          boxShadow: &quot;0 2px 4px rgba(0, 0, 0, 0.05)&quot;,
        }}
      >
        <h3
          style={{
            margin: &quot;0 0 16px 0&quot;,
            fontSize: &quot;18px&quot;,
            fontWeight: &quot;bold&quot;,
            color: &quot;#000000&quot;,
            borderBottom: &quot;2px solid #667eea&quot;,
            paddingBottom: &quot;8px&quot;,
          }}
        >
          💰 Plan Assets Summary
        </h3>

        <table
          style={{
            width: &quot;100%&quot;,
            borderCollapse: &quot;collapse&quot; as const,
            backgroundColor: &quot;white&quot;,
            borderRadius: &quot;8px&quot;,
            overflow: &quot;hidden&quot;,
            boxShadow: &quot;0 1px 3px rgba(0, 0, 0, 0.1)&quot;,
          }}
        >
          <thead>
            <tr style={{ backgroundColor: &quot;#f8fafc&quot; }}>
              <th
                style={{
                  padding: &quot;12px&quot;,
                  textAlign: &quot;left&quot; as const,
                  fontWeight: &quot;bold&quot;,
                  color: &quot;#374151&quot;,
                  borderBottom: &quot;1px solid #e5e7eb&quot;,
                }}
              >
                Asset Category
              </th>
              <th
                style={{
                  padding: &quot;12px&quot;,
                  textAlign: &quot;right&quot; as const,
                  fontWeight: &quot;bold&quot;,
                  color: &quot;#374151&quot;,
                  borderBottom: &quot;1px solid #e5e7eb&quot;,
                }}
              >
                2023 Value
              </th>
              <th
                style={{
                  padding: &quot;12px&quot;,
                  textAlign: &quot;right&quot; as const,
                  fontWeight: &quot;bold&quot;,
                  color: &quot;#374151&quot;,
                  borderBottom: &quot;1px solid #e5e7eb&quot;,
                }}
              >
                2022 Value
              </th>
              <th
                style={{
                  padding: &quot;12px&quot;,
                  textAlign: &quot;right&quot; as const,
                  fontWeight: &quot;bold&quot;,
                  color: &quot;#374151&quot;,
                  borderBottom: &quot;1px solid #e5e7eb&quot;,
                }}
              >
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {filing.summaryData?.planAssets?.map((asset, index) => (
              <tr key={index} style={{ backgroundColor: index % 2 === 0 ? &quot;#ffffff&quot; : &quot;#f9fafb&quot; }}>
                <td style={{ padding: &quot;12px&quot;, borderBottom: &quot;1px solid #f1f5f9&quot; }}>{asset.category}</td>
                <td style={{ padding: &quot;12px&quot;, textAlign: &quot;right&quot; as const, borderBottom: &quot;1px solid #f1f5f9&quot; }}>${asset.value2023.toLocaleString()}</td>
                <td style={{ padding: &quot;12px&quot;, textAlign: &quot;right&quot; as const, borderBottom: &quot;1px solid #f1f5f9&quot; }}>${asset.value2022.toLocaleString()}</td>
                <td
                  style={{
                    padding: &quot;12px&quot;,
                    textAlign: &quot;right&quot; as const,
                    borderBottom: &quot;1px solid #f1f5f9&quot;,
                    color: asset.change > 0 ? &quot;#059669&quot; : &quot;#dc2626&quot;,
                  }}
                >
                  {asset.change > 0 ? &quot;↗ &quot; : &quot;↘ &quot;} {asset.change.toFixed(2)}%
                </td>
              </tr>
            ))}
            <tr style={{ backgroundColor: &quot;#ffffff&quot;, fontWeight: &quot;bold&quot; }}>
              <td style={{ padding: &quot;12px&quot;, borderTop: &quot;2px solid #e5e7eb&quot; }}>Total Plan Assets</td>
              <td style={{ padding: &quot;12px&quot;, textAlign: &quot;right&quot; as const, borderTop: &quot;2px solid #e5e7eb&quot; }}>${filing.summaryData?.totalPlanAssets?.toLocaleString() || &apos;N/A&apos;}</td>
              <td style={{ padding: &quot;12px&quot;, textAlign: &quot;right&quot; as const, borderTop: &quot;2px solid #e5e7eb&quot; }}>${filing.summaryData?.totalPlanAssets2022?.toLocaleString() || &apos;N/A&apos;}</td>
              <td
                style={{
                  padding: &quot;12px&quot;,
                  textAlign: &quot;right&quot; as const,
                  borderTop: &quot;2px solid #e5e7eb&quot;,
                  color: &quot;#059669&quot;,
                }}
              >
                {filing.summaryData?.totalPlanAssetsChange ? `↗ ${filing.summaryData.totalPlanAssetsChange.toFixed(2)}%` : &apos;N/A&apos;}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Investment Performance */}
      <div
        style={{
          padding: &quot;20px&quot;,
          background: &quot;linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)&quot;,
          borderBottom: &quot;1px solid #e5e7eb&quot;,
          boxShadow: &quot;0 2px 4px rgba(0, 0, 0, 0.05)&quot;,
        }}
      >
        <h3
          style={{
            margin: &quot;0 0 16px 0&quot;,
            fontSize: &quot;18px&quot;,
            fontWeight: &quot;bold&quot;,
            color: &quot;#000000&quot;,
            borderBottom: &quot;2px solid #667eea&quot;,
            paddingBottom: &quot;8px&quot;,
          }}
        >
          📈 Top Investment Options Performance
        </h3>

        <table
          style={{
            width: &quot;100%&quot;,
            borderCollapse: &quot;collapse&quot; as const,
            backgroundColor: &quot;white&quot;,
            borderRadius: &quot;8px&quot;,
            overflow: &quot;hidden&quot;,
            boxShadow: &quot;0 1px 3px rgba(0, 0, 0, 0.1)&quot;,
          }}
        >
          <thead>
            <tr style={{ backgroundColor: &quot;#f8fafc&quot; }}>
              <th
                style={{
                  padding: &quot;12px&quot;,
                  textAlign: &quot;left&quot; as const,
                  fontWeight: &quot;bold&quot;,
                  color: &quot;#374151&quot;,
                  borderBottom: &quot;1px solid #e5e7eb&quot;,
                }}
              >
                Investment Option
              </th>
              <th
                style={{
                  padding: &quot;12px&quot;,
                  textAlign: &quot;right&quot; as const,
                  fontWeight: &quot;bold&quot;,
                  color: &quot;#374151&quot;,
                  borderBottom: &quot;1px solid #e5e7eb&quot;,
                }}
              >
                1-Year Return
              </th>
              <th
                style={{
                  padding: &quot;12px&quot;,
                  textAlign: &quot;right&quot; as const,
                  fontWeight: &quot;bold&quot;,
                  color: &quot;#374151&quot;,
                  borderBottom: &quot;1px solid #e5e7eb&quot;,
                }}
              >
                Assets
              </th>
            </tr>
          </thead>
          <tbody>
            {filing.summaryData?.investmentOptions?.map((option, index) => (
              <tr key={index} style={{ backgroundColor: index % 2 === 0 ? &quot;#ffffff&quot; : &quot;#f9fafb&quot; }}>
                <td style={{ padding: &quot;12px&quot;, borderBottom: &quot;1px solid #f1f5f9&quot; }}>{option.name}</td>
                <td
                  style={{
                    padding: &quot;12px&quot;,
                    textAlign: &quot;right&quot; as const,
                    borderBottom: &quot;1px solid #f1f5f9&quot;,
                    color: option.return > 0 ? &quot;#059669&quot; : &quot;#dc2626&quot;,
                  }}
                >
                  {option.return > 0 ? &quot;↗ &quot; : &quot;↘ &quot;} {option.return.toFixed(2)}%
                </td>
                <td style={{ padding: &quot;12px&quot;, textAlign: &quot;right&quot; as const, borderBottom: &quot;1px solid #f1f5f9&quot; }}>${option.assets.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Plan Highlights */}
      <div
        style={{
          padding: &quot;20px&quot;,
          background: &quot;linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)&quot;,
          borderBottom: &quot;1px solid #e5e7eb&quot;,
          boxShadow: &quot;0 2px 4px rgba(0, 0, 0, 0.05)&quot;,
        }}
      >
        <h3
          style={{
            margin: &quot;0 0 16px 0&quot;,
            fontSize: &quot;18px&quot;,
            fontWeight: &quot;bold&quot;,
            color: &quot;#000000&quot;,
            borderBottom: &quot;2px solid #667eea&quot;,
            paddingBottom: &quot;8px&quot;,
          }}
        >
          ✨ 2023 Plan Highlights
        </h3>

        <div
          style={{
            backgroundColor: &quot;white&quot;,
            borderRadius: &quot;8px&quot;,
            padding: &quot;16px&quot;,
            boxShadow: &quot;0 1px 3px rgba(0, 0, 0, 0.1)&quot;,
          }}
        >
          <div style={{ marginBottom: &quot;12px&quot; }}>
            <strong style={{ color: &quot;#000000&quot; }}>Participation Rate:</strong>
            <span style={{ color: &quot;#374151&quot;, marginLeft: &quot;8px&quot; }}>{filing.summaryData?.participationRate ?? &apos;N/A&apos;}</span>
          </div>
          <div style={{ marginBottom: &quot;12px&quot; }}>
            <strong style={{ color: &quot;#000000&quot; }}>Average Account Balance:</strong>
            <span style={{ color: &quot;#374151&quot;, marginLeft: &quot;8px&quot; }}>${filing.summaryData?.averageAccountBalance?.toLocaleString() ?? &apos;N/A&apos;}</span>
          </div>
          <div style={{ marginBottom: &quot;12px&quot; }}>
            <strong style={{ color: &quot;#000000&quot; }}>Company Match:</strong>
            <span style={{ color: &quot;#374151&quot;, marginLeft: &quot;8px&quot; }}>
              ${filing.summaryData?.companyMatch?.toLocaleString() ?? &apos;N/A&apos;} (6% match on first 6% of salary)
            </span>
          </div>
          <div style={{ marginBottom: &quot;12px&quot; }}>
            <strong style={{ color: &quot;#000000&quot; }}>New Investment Options:</strong>
            <span style={{ color: &quot;#374151&quot;, marginLeft: &quot;8px&quot; }}>{filing.summaryData?.newInvestmentOptions || &apos;N/A&apos;}</span>
          </div>
          <div>
            <strong style={{ color: &quot;#000000&quot; }}>Plan Expenses:</strong>
            <span style={{ color: &quot;#374151&quot;, marginLeft: &quot;8px&quot; }}>{filing.summaryData?.planExpenses || &apos;N/A&apos;}</span>
          </div>
        </div>
      </div>

      {/* Participant Statistics */}
      <div
        style={{
          padding: &quot;20px&quot;,
          background: &quot;linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)&quot;,
          borderBottom: &quot;1px solid #e5e7eb&quot;,
          boxShadow: &quot;0 2px 4px rgba(0, 0, 0, 0.05)&quot;,
        }}
      >
        <h3
          style={{
            margin: &quot;0 0 16px 0&quot;,
            fontSize: &quot;18px&quot;,
            fontWeight: &quot;bold&quot;,
            color: &quot;#000000&quot;,
            borderBottom: &quot;2px solid #667eea&quot;,
            paddingBottom: &quot;8px&quot;,
          }}
        >
          👥 Participant Demographics
        </h3>

        <table
          style={{
            width: &quot;100%&quot;,
            borderCollapse: &quot;collapse&quot; as const,
            backgroundColor: &quot;white&quot;,
            borderRadius: &quot;8px&quot;,
            overflow: &quot;hidden&quot;,
            boxShadow: &quot;0 1px 3px rgba(0, 0, 0, 0.1)&quot;,
          }}
        >
          <tbody>
            <tr style={{ backgroundColor: &quot;#f8fafc&quot; }}>
              <td style={{ padding: &quot;12px&quot;, fontWeight: &quot;bold&quot;, color: &quot;#374151&quot;, borderBottom: &quot;1px solid #e5e7eb&quot; }}>
                Active Participants
              </td>
              <td
                style={{
                  padding: &quot;12px&quot;,
                  textAlign: &quot;right&quot; as const,
                  color: &quot;#374151&quot;,
                  borderBottom: &quot;1px solid #e5e7eb&quot;,
                }}
              >
                {filing.summaryData?.activeParticipants || &apos;N/A&apos;}
              </td>
            </tr>
            <tr style={{ backgroundColor: &quot;#ffffff&quot; }}>
              <td style={{ padding: &quot;12px&quot;, color: &quot;#374151&quot;, borderBottom: &quot;1px solid #f1f5f9&quot; }}>
                Participants with Loans
              </td>
              <td
                style={{
                  padding: &quot;12px&quot;,
                  textAlign: &quot;right&quot; as const,
                  color: &quot;#374151&quot;,
                  borderBottom: &quot;1px solid #f1f5f9&quot;,
                }}
              >
                12,300 (8%)
              </td>
            </tr>
            <tr style={{ backgroundColor: &quot;#f9fafb&quot; }}>
              <td style={{ padding: &quot;12px&quot;, color: &quot;#374151&quot;, borderBottom: &quot;1px solid #f1f5f9&quot; }}>
                Participants with Hardship Withdrawals
              </td>
              <td
                style={{
                  padding: &quot;12px&quot;,
                  textAlign: &quot;right&quot; as const,
                  color: &quot;#374151&quot;,
                  borderBottom: &quot;1px solid #f1f5f9&quot;,
                }}
              >
                2,100 (1.4%)
              </td>
            </tr>
            <tr style={{ backgroundColor: &quot;#ffffff&quot; }}>
              <td style={{ padding: &quot;12px&quot;, color: &quot;#374151&quot;, borderBottom: &quot;1px solid #f1f5f9&quot; }}>
                New Participants in 2023
              </td>
              <td
                style={{
                  padding: &quot;12px&quot;,
                  textAlign: &quot;right&quot; as const,
                  color: &quot;#374151&quot;,
                  borderBottom: &quot;1px solid #f1f5f9&quot;,
                }}
              >
                18,500
              </td>
            </tr>
            <tr style={{ backgroundColor: &quot;#f9fafb&quot; }}>
              <td style={{ padding: &quot;12px&quot;, color: &quot;#374151&quot; }}>Average Contribution Rate</td>
              <td style={{ padding: &quot;12px&quot;, textAlign: &quot;right&quot; as const, color: &quot;#374151&quot; }}>8.2% of salary</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Compliance & Regulatory */}
      <div
        style={{
          padding: &quot;20px&quot;,
          background: &quot;linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)&quot;,
          boxShadow: &quot;0 2px 4px rgba(0, 0, 0, 0.05)&quot;,
        }}
      >
        <h3
          style={{
            margin: &quot;0 0 16px 0&quot;,
            fontSize: &quot;18px&quot;,
            fontWeight: &quot;bold&quot;,
            color: &quot;#000000&quot;,
            borderBottom: &quot;2px solid #667eea&quot;,
            paddingBottom: &quot;8px&quot;,
          }}
        >
          ⚖️ Compliance & Regulatory Updates
        </h3>

        <div
          style={{
            backgroundColor: &quot;white&quot;,
            borderRadius: &quot;8px&quot;,
            padding: &quot;16px&quot;,
            boxShadow: &quot;0 1px 3px rgba(0, 0, 0, 0.1)&quot;,
          }}
        >
          <div style={{ marginBottom: &quot;12px&quot; }}>
            <strong style={{ color: &quot;#000000&quot; }}>ERISA Compliance:</strong>
            <span style={{ color: &quot;#374151&quot;, marginLeft: &quot;8px&quot; }}>
              Plan passed all required non-discrimination tests
            </span>
          </div>
          <div style={{ marginBottom: &quot;12px&quot; }}>
            <strong style={{ color: &quot;#000000&quot; }}>Audit Status:</strong>
            <span style={{ color: &quot;#374151&quot;, marginLeft: &quot;8px&quot; }}>
              Clean audit opinion received from independent auditors
            </span>
          </div>
          <div style={{ marginBottom: &quot;12px&quot; }}>
            <strong style={{ color: &quot;#000000&quot; }}>SECURE Act 2.0:</strong>
            <span style={{ color: &quot;#374151&quot;, marginLeft: &quot;8px&quot; }}>Implemented automatic enrollment for new hires</span>
          </div>
          <div>
            <strong style={{ color: &quot;#000000&quot; }}>Fiduciary Review:</strong>
            <span style={{ color: &quot;#374151&quot;, marginLeft: &quot;8px&quot; }}>Annual investment committee review completed</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: &quot;16px&quot;,
          backgroundColor: &quot;#f8fafc&quot;,
          textAlign: &quot;center&quot; as const,
          fontSize: &quot;12px&quot;,
          color: &quot;#6b7280&quot;,
          borderTop: &quot;1px solid #e5e7eb&quot;,
        }}
      >
        <p style={{ margin: &quot;0&quot; }}>
          This summary is based on the official Form 11-K filing. For complete details, please refer to the full SEC
          filing.
        </p>
      </div>
    </div>
  )
}
