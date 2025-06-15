export default function FormS3EmailTemplate() {
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
              <p style={{ margin: "12px 0 0", fontSize: "18px", opacity: "0.9" }}>6/6/2025</p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Filing Information */}
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderTop: "none" }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "24px" }}>
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
                        Johnson & Johnson (JNJ) - Form S-3 Filing
                      </h2>
                      <p style={{ margin: "8px 0 20px", color: "#64748b", fontSize: "14px" }}>Filed on: 6/5/2025</p>
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
                  backgroundColor: "#fafafa",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)",
                  backgroundImage: "linear-gradient(to bottom, #ffffff, #f9fafb)",
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
                          borderBottom: "2px solid #f1f5f9",
                          paddingBottom: "8px",
                        }}
                      >
                        📋 Summary
                      </h3>

                      <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse" }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: "8px 0", width: "140px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Company:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px", fontWeight: "600" }}>
                                Johnson & Johnson
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "140px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Form Type:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>
                                Form S-3 (Shelf Registration)
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "140px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Securities Type:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>
                                Debt Securities & Common Stock
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "140px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Shelf Amount:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>$10.0 billion</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "140px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Shelf Period:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>3 years</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "140px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Credit Rating:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>
                                AAA (S&P) / Aaa (Moody's)
                              </p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Securities Details */}
              <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fafafa",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)",
                  backgroundImage: "linear-gradient(to bottom, #ffffff, #f9fafb)",
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
                          borderBottom: "2px solid #f1f5f9",
                          paddingBottom: "8px",
                        }}
                      >
                        📄 Securities Registered
                      </h3>

                      <table
                        width="100%"
                        cellPadding="0"
                        cellSpacing="0"
                        style={{
                          borderCollapse: "collapse",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: "#f1f5f9" }}>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "left",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              SECURITY TYPE
                            </th>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              AMOUNT
                            </th>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "center",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              PURPOSE
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              Senior Debt Securities
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              $7.0B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "center",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              General Corporate
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              Subordinated Debt Securities
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              $2.0B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "center",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              Acquisitions
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              Common Stock
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              $1.0B
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "center",
                                fontSize: "14px",
                                color: "#374151",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              Strategic Flexibility
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Intended Use */}
              <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fafafa",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)",
                  backgroundImage: "linear-gradient(to bottom, #ffffff, #f9fafb)",
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
                          borderBottom: "2px solid #f1f5f9",
                          paddingBottom: "8px",
                        }}
                      >
                        💼 Intended Use of Proceeds
                      </h3>

                      <div
                        style={{
                          padding: "12px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                          marginBottom: "12px",
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 8px",
                            color: "#374151",
                            fontSize: "16px",
                            fontWeight: "bold",
                          }}
                        >
                          General Corporate Purposes (70%)
                        </h4>
                        <p style={{ margin: "0", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                          Working capital, capital expenditures, research and development activities, and other general
                          corporate purposes to support J&J's diversified healthcare portfolio.
                        </p>
                      </div>

                      <div
                        style={{
                          padding: "12px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                          marginBottom: "12px",
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 8px",
                            color: "#374151",
                            fontSize: "16px",
                            fontWeight: "bold",
                          }}
                        >
                          Strategic Acquisitions (20%)
                        </h4>
                        <p style={{ margin: "0", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                          Potential acquisitions of complementary businesses, technologies, or products that align with
                          J&J's pharmaceutical, medical device, and consumer health strategies.
                        </p>
                      </div>

                      <div
                        style={{
                          padding: "12px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 8px",
                            color: "#374151",
                            fontSize: "16px",
                            fontWeight: "bold",
                          }}
                        >
                          Debt Refinancing (10%)
                        </h4>
                        <p style={{ margin: "0", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                          Refinancing of existing debt obligations to optimize capital structure and take advantage of
                          favorable market conditions.
                        </p>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Market Advantages */}
              <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fafafa",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)",
                  backgroundImage: "linear-gradient(to bottom, #ffffff, #f9fafb)",
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: "20px" }}>
                      <h3
                        style={{
                          margin: "0 0 12px",
                          color: "#000000",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderBottom: "2px solid #f1f5f9",
                          paddingBottom: "8px",
                        }}
                      >
                        ⭐ Shelf Registration Advantages
                      </h3>
                      <ul
                        style={{
                          margin: "0",
                          paddingLeft: "20px",
                          color: "#374151",
                          fontSize: "14px",
                          lineHeight: "1.6",
                        }}
                      >
                        <li style={{ marginBottom: "8px" }}>
                          <strong>Market Timing:</strong> Ability to access capital markets quickly when conditions are
                          favorable without lengthy registration delays.
                        </li>
                        <li style={{ marginBottom: "8px" }}>
                          <strong>Cost Efficiency:</strong> Reduced issuance costs and administrative burden compared to
                          individual registrations for each offering.
                        </li>
                        <li style={{ marginBottom: "8px" }}>
                          <strong>Strategic Flexibility:</strong> Option to issue different types of securities based on
                          market conditions and corporate needs.
                        </li>
                        <li style={{ marginBottom: "8px" }}>
                          <strong>Competitive Advantage:</strong> Enhanced ability to respond quickly to acquisition
                          opportunities and strategic initiatives.
                        </li>
                        <li>
                          <strong>Credit Profile:</strong> J&J's AAA credit rating provides access to the most favorable
                          borrowing terms in the market.
                        </li>
                      </ul>
                    </td>
                  </tr>
                </tbody>
              </table>
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
          backgroundColor: "white",
          borderRadius: "0 0 12px 12px",
          border: "1px solid #e2e8f0",
          borderTop: "none",
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "20px", textAlign: "center" }}>
              <a
                href="#"
                style={{
                  display: "inline-block",
                  padding: "12px 24px",
                  background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)",
                  color: "white",
                  textDecoration: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                View on SEC Website
              </a>
              <p style={{ margin: "16px 0 0", color: "#6B7280", fontSize: "12px" }}>
                © 2025 tldrSEC. All rights reserved.
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
