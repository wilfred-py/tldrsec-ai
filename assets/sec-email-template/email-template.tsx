import { FilingSummaryResult } from '../../services/filingService';

interface TemplateProps {
  summaries: FilingSummaryResult[];
  errors: { ticker: string; error: string }[];
}

export default function SECFilingEmailTemplate({ summaries, errors }: TemplateProps) {
  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", fontFamily: "Arial, sans-serif", backgroundColor: "#f8fafc" }}>
      {/* Header with gradient background */}
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{
          background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)",
          color: "white",
          borderRadius: "12px 12px 0 0",
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "24px", textAlign: "center" }}>
              <h1 style={{ margin: "0", fontSize: "32px", fontWeight: "bold", letterSpacing: "-0.5px" }}>
                SEC Filing Summaries
              </h1>
              <p style={{ margin: "12px 0 0", fontSize: "18px", opacity: "0.9" }}>{new Date().toLocaleDateString()}</p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Main content body */}
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderTop: "none" }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "24px" }}>
              {/* Loop through summaries and render a section for each */}
              {summaries.map((summary, index) => {
                return (
                  <div key={index} style={{ marginBottom: '24px', borderBottom: index < summaries.length - 1 ? '1px solid #e2e8f0' : 'none', paddingBottom: index < summaries.length - 1 ? '24px' : '0' }}>
                    {/* Filing Title */}
                    <table width="100%" cellPadding="0" cellSpacing="0">
                      <tbody>
                        <tr>
                          <td>
                            <h2
                              style={{
                                margin: "0",
                                background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                backgroundClip: "text",
                                fontSize: "24px",
                                fontWeight: "bold",
                              }}
                            >
                              {summary.companyName} ({summary.ticker}) - {summary.filingType}
                            </h2>
                            <p style={{ margin: "8px 0 20px", color: "#64748b", fontSize: "14px" }}>
                              Filed on: {new Date(summary.filingDate).toLocaleDateString()}
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Summary Box */}
                    <table
                      width="100%"
                      cellPadding="0"
                      cellSpacing="0"
                      style={{
                        backgroundColor: "#fefefe",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        marginBottom: "20px",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                      }}
                    >
                      <tbody>
                        <tr>
                          <td style={{ padding: "20px" }}>
                            <h3
                              style={{
                                margin: "0 0 16px",
                                color: "#000000",
                                fontSize: "18px",
                                fontWeight: "bold",
                              }}
                            >
                              📋 Summary
                            </h3>
                            <p style={{ margin: "0", color: "#374151", fontSize: "14px", lineHeight: '1.6' }}>
                              {summary.summaryText}
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Key Points Box */}
                    {summary.keyPoints && summary.keyPoints.length > 0 && (
                      <table
                        width="100%"
                        cellPadding="0"
                        cellSpacing="0"
                        style={{
                          backgroundColor: "#fefefe",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          marginBottom: "20px",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                        }}
                      >
                        <tbody>
                          <tr>
                            <td style={{ padding: "20px" }}>
                              <h3
                                style={{
                                  margin: "0 0 16px",
                                  color: "#000000",
                                  fontSize: "18px",
                                  fontWeight: "bold",
                                }}
                              >
                                🔑 Key Points
                              </h3>
                              <ul style={{ margin: "0", paddingLeft: "20px", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                                {summary.keyPoints.map((point, i) => (
                                  <li key={i} style={{ marginBottom: "4px" }}>{point}</li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                    
                    {/* View on SEC Link */}
                    <table width="100%" cellPadding="0" cellSpacing="0">
                        <tbody>
                            <tr>
                                <td style={{ textAlign: 'center', padding: '20px' }}>
                                    <a href={summary.url} target="_blank" rel="noopener noreferrer" style={{ backgroundColor: '#6D28D9', color: 'white', padding: '12px 24px', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
                                        View on SEC.gov
                                    </a>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                  </div>
                );
              })}

              {/* Errors Section */}
              {errors && errors.length > 0 && (
                <table
                  width="100%"
                  cellPadding="0"
                  cellSpacing="0"
                  style={{
                    backgroundColor: "#fff5f5",
                    border: "1px solid #fecaca",
                    borderRadius: "8px",
                    marginTop: "24px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }}
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: "20px" }}>
                        <h3
                          style={{
                            margin: "0 0 16px",
                            color: "#991b1b",
                            fontSize: "18px",
                            fontWeight: "bold",
                          }}
                        >
                          ⚠️ Errors Encountered
                        </h3>
                        <ul style={{ margin: "0", paddingLeft: "20px", color: "#b91c1c", fontSize: "14px", lineHeight: "1.6" }}>
                          {errors.map((error, i) => (
                            <li key={i} style={{ marginBottom: "4px" }}><strong>{error.ticker}:</strong> {error.error}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      
      {/* Footer */}
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{
          marginTop: "32px",
          textAlign: "center",
          color: "#64748b",
          fontSize: "12px",
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "20px" }}>
              <p style={{ margin: "0 0 8px" }}>
                Generated by tldrSEC. Not financial advice.
              </p>
              <p style={{ margin: "0" }}>
                <a href="#unsubscribe" style={{ color: "#64748b", textDecoration: "underline" }}>Unsubscribe</a>
                &nbsp;&middot;&nbsp;
                <a href="#settings" style={{ color: "#64748b", textDecoration: "underline" }}>Settings</a>
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
