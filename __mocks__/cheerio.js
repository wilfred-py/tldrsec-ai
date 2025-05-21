// Mock cheerio implementation
const cheerioMock = {
  load: jest.fn().mockImplementation((html) => {
    // Return a function that acts like the cheerio selector
    const $ = jest.fn().mockImplementation((selector) => {
      // Return an object with cheerio methods
      return {
        text: jest.fn().mockReturnValue('Mock Text'),
        html: jest.fn().mockReturnValue('<div>Mock HTML</div>'),
        attr: jest.fn().mockReturnValue('mock-attr'),
        find: jest.fn().mockReturnThis(),
        children: jest.fn().mockReturnThis(),
        each: jest.fn((callback) => {
          // Call the callback once with mock data
          callback(0, { tagName: 'div' });
          return $;
        }),
        toArray: jest.fn().mockReturnValue([]),
        eq: jest.fn().mockReturnThis(),
        next: jest.fn().mockReturnThis(),
        prev: jest.fn().mockReturnThis(),
        parent: jest.fn().mockReturnThis(),
        closest: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnValue(false),
        hasClass: jest.fn().mockReturnValue(false),
        addClass: jest.fn().mockReturnThis(),
        removeClass: jest.fn().mockReturnThis(),
        toggleClass: jest.fn().mockReturnThis(),
        css: jest.fn().mockReturnThis(),
        data: jest.fn().mockReturnValue({}),
        map: jest.fn().mockReturnThis(),
        get: jest.fn().mockReturnValue({}),
        first: jest.fn().mockReturnThis(),
        last: jest.fn().mockReturnThis(),
        contents: jest.fn().mockReturnThis(),
        slice: jest.fn().mockReturnThis(),
        filter: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        has: jest.fn().mockReturnThis(),
        length: 1
      };
    });
    
    // Add cheerio methods to the function object
    $.html = jest.fn().mockReturnValue('<html><body>Mock HTML</body></html>');
    $.text = jest.fn().mockReturnValue('Mock Text');
    $.root = jest.fn().mockReturnThis();
    
    return $;
  })
};

module.exports = cheerioMock; 