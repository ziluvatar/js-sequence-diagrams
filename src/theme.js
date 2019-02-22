/** js sequence diagrams
 *  https://bramp.github.io/js-sequence-diagrams/
 *  (c) 2012-2017 Andrew Brampton (bramp.net)
 *  Simplified BSD license.
 */
/*global Diagram, _ */

// Following the CSS convention
// Margin is the gap outside the box
// Padding is the gap inside the box
// Each object has x/y/width/height properties
// The x/y should be top left corner
// width/height is with both margin and padding

// TODO
// Image width is wrong, when there is a note in the right hand col
// Title box could look better
// Note box could look better

var DIAGRAM_MARGIN = 10;

var ACTOR_MARGIN   = 10; // Margin around a actor
var ACTOR_PADDING  = 10; // Padding inside a actor

var SIGNAL_MARGIN  = 5; // Margin around a signal
var SIGNAL_PADDING = 5; // Padding inside a signal

var NOTE_MARGIN   = 10; // Margin around a note
var NOTE_PADDING  = 5; // Padding inside a note
var NOTE_OVERLAP  = 15; // Overlap when using a "note over A,B"

var TITLE_MARGIN   = 0;
var TITLE_PADDING  = 5;

var SELF_SIGNAL_WIDTH = 20; // How far out a self signal goes

var PLACEMENT = Diagram.PLACEMENT;
var LINETYPE  = Diagram.LINETYPE;
var ARROWTYPE = Diagram.ARROWTYPE;

var ALIGN_LEFT   = 0;
var ALIGN_CENTER = 1;

var OPTIONAL_MAIN_MARGIN = 5;
var OPTIONAL_MAIN_PADDING = 5;
var OPTIONAL_MAIN_OVERLAP = 15;
var OPTIONAL_LABEL_MARGIN = 0;
var OPTIONAL_LABEL_PADDING = 5;
var OPTIONAL_MESSAGE_MARGIN = 1;
var OPTIONAL_MESSAGE_PADDING = 3;

function buildOptionalLabelBox(theme) {
  var optLabel = 'opt';
  var labelTextBB = theme.textBBox(optLabel, theme.font_);
  labelTextBB.height += OPTIONAL_LABEL_PADDING * 2
  labelTextBB.width += OPTIONAL_LABEL_PADDING * 2
  labelTextBB.text = optLabel;
  return labelTextBB;
}

function buildOptionalMessageBox(theme, message) {
  var text = '[' + message + ']';
  var messageTextBB = theme.textBBox(text, theme.font_);
  messageTextBB.height += OPTIONAL_MESSAGE_PADDING * 2
  messageTextBB.width += OPTIONAL_MESSAGE_PADDING * 2
  messageTextBB.text = text;
  return messageTextBB;
}

function buildOptionalHeaderBox(theme, message) {
  var labelBox = buildOptionalLabelBox(theme);
  var messageBox = buildOptionalMessageBox(theme, message);
  return {
    labelBox: labelBox,
    messageBox: messageBox,
    width: labelBox.width + messageBox.width,
    height: Math.max(labelBox.height, messageBox.height)
  };
}

function AssertException(message) { this.message = message; }
AssertException.prototype.toString = function() {
  return 'AssertException: ' + this.message;
};

function assert(exp, message) {
  if (!exp) {
    throw new AssertException(message);
  }
}

if (!String.prototype.trim) {
  String.prototype.trim = function() {
    return this.replace(/^\s+|\s+$/g, '');
  };
}

Diagram.themes = {};
function registerTheme(name, theme) {
  Diagram.themes[name] = theme;
}

/******************
 * Drawing extras
 ******************/

function getCenterX(box) {
  return box.x + box.width / 2;
}

function getCenterY(box) {
  return box.y + box.height / 2;
}

/******************
 * SVG Path extras
 ******************/

function clamp(x, min, max) {
  if (x < min) {
    return min;
  }
  if (x > max) {
    return max;
  }
  return x;
}

function wobble(x1, y1, x2, y2) {
  assert(_.every([x1,x2,y1,y2], _.isFinite), 'x1,x2,y1,y2 must be numeric');

  // Wobble no more than 1/25 of the line length
  var factor = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)) / 25;

  // Distance along line where the control points are
  // Clamp between 20% and 80% so any arrow heads aren't angled too much
  var r1 = clamp(Math.random(), 0.2, 0.8);
  var r2 = clamp(Math.random(), 0.2, 0.8);

  var xfactor = Math.random() > 0.5 ? factor : -factor;
  var yfactor = Math.random() > 0.5 ? factor : -factor;

  var p1 = {
    x: (x2 - x1) * r1 + x1 + xfactor,
    y: (y2 - y1) * r1 + y1 + yfactor
  };

  var p2 = {
    x: (x2 - x1) * r2 + x1 - xfactor,
    y: (y2 - y1) * r2 + y1 - yfactor
  };

  return 'C' + p1.x.toFixed(1) + ',' + p1.y.toFixed(1) + // start control point
         ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1) + // end control point
         ' ' + x2.toFixed(1) + ',' + y2.toFixed(1);      // end point
}

/**
 * Draws a wobbly (hand drawn) rect
 */
function handRect(x, y, w, h) {
  assert(_.every([x, y, w, h], _.isFinite), 'x, y, w, h must be numeric');
  return 'M' + x + ',' + y +
   wobble(x, y, x + w, y) +
   wobble(x + w, y, x + w, y + h) +
   wobble(x + w, y + h, x, y + h) +
   wobble(x, y + h, x, y);
}

/**
 * Draws a wobbly (hand drawn) line
 */
function handLine(x1, y1, x2, y2) {
  assert(_.every([x1,x2,y1,y2], _.isFinite), 'x1,x2,y1,y2 must be numeric');
  return 'M' + x1.toFixed(1) + ',' + y1.toFixed(1) + wobble(x1, y1, x2, y2);
}

/******************
 * BaseTheme
 ******************/

var BaseTheme = function(diagram, options) {
  this.init(diagram, options);
};

_.extend(BaseTheme.prototype, {

  // Init called while creating the Theme
  init: function(diagram, options) {
    this.diagram = diagram;

    this.actorsHeight_  = 0;
    this.signalsHeight_ = 0;
    this.title_ = undefined; // hack - This should be somewhere better
  },

  setupPaper: function(container) {},

  draw: function(container) {
    this.setupPaper(container);

    this.layout();

    var titleHeight = this.title_ ? this.title_.height : 0;
    var y = DIAGRAM_MARGIN + titleHeight;

    this.drawTitle();
    this.drawActors(y);
    this.drawSignals(y + this.actorsHeight_);
  },

  actorEnsureDistance: function (a, b, d) {
    assert(a < b, 'a must be less than or equal to b');

    if (a < 0) {
      // Ensure b has left margin
      b = this.diagram.actors[b];
      b.x = Math.max(d - b.width / 2, b.x);
    } else if (b >= this.diagram.actors.length) {
      // Ensure a has right margin
      a = this.diagram.actors[a];
      a.paddingRight = Math.max(d, a.paddingRight);
    } else {
      a = this.diagram.actors[a];
      a.distances[b] = Math.max(d, a.distances[b] ? a.distances[b] : 0);
    }
  },

  signalLayout: function (signal) {
    var bb = this.textBBox(signal.message, this.font_);

    signal.textBB = bb;
    signal.width = bb.width + (SIGNAL_MARGIN + SIGNAL_PADDING) * 2;
    signal.height = bb.height + (SIGNAL_MARGIN + SIGNAL_PADDING) * 2;

    if (signal.isSelf()) {
      // TODO Self signals need a min height
      a = signal.actorA.index;
      b = a + 1;
      signal.width += SELF_SIGNAL_WIDTH;
    } else {
      a = Math.min(signal.actorA.index, signal.actorB.index);
      b = Math.max(signal.actorA.index, signal.actorB.index);
    }
    this.actorEnsureDistance(a, b, signal.width);
  },

  noteLayout: function (signal) {
    var bb = this.textBBox(signal.message, this.font_);

    signal.textBB = bb;
    signal.width = bb.width + (NOTE_MARGIN + NOTE_PADDING) * 2;
    signal.height = bb.height + (NOTE_MARGIN + NOTE_PADDING) * 2;

    // HACK lets include the actor'signal padding
    var extraWidth = 2 * ACTOR_MARGIN;

    if (signal.placement == PLACEMENT.LEFTOF) {
      b = signal.actor.index;
      a = b - 1;
      this.actorEnsureDistance(a, b, signal.width + extraWidth);
    } else if (signal.placement == PLACEMENT.RIGHTOF) {
      a = signal.actor.index;
      b = a + 1;
      this.actorEnsureDistance(a, b, signal.width + extraWidth);
    } else if (signal.placement == PLACEMENT.OVER && signal.hasManyActors()) {
      // Over multiple actors
      a = Math.min(signal.actor[0].index, signal.actor[1].index);
      b = Math.max(signal.actor[0].index, signal.actor[1].index);

      // We don't need our padding, and we want to overlap
      extraWidth = -(NOTE_PADDING * 2 + NOTE_OVERLAP * 2);
      this.actorEnsureDistance(a, b, signal.width + extraWidth);
    } else if (signal.placement == PLACEMENT.OVER) {
      // Over single actor
      a = signal.actor.index;
      this.actorEnsureDistance(a - 1, a, signal.width / 2);
      this.actorEnsureDistance(a, a + 1, signal.width / 2);
    }
  },

  optionalLayout: function(signal) {
    // Nested signal layouts
    this.processSignalLayouts(signal.signals);
    var nestedHeight = _.reduce(signal.signals, function (totalHeight, s) {
      return totalHeight + s.height;
    }, 0);
    var nestedWidth = _.reduce(signal.signals, function (maxWidth, s) {
      return Math.max(maxWidth, s.width);
    }, 0);

    // Own optional layout
    signal.headerBox = buildOptionalHeaderBox(this, signal.message);

    signal.ownWidth = signal.headerBox.width + (OPTIONAL_MAIN_MARGIN + OPTIONAL_MAIN_PADDING) * 2;
    signal.nestedWidth = nestedWidth + (OPTIONAL_MAIN_MARGIN + OPTIONAL_MAIN_PADDING) * 2;

    signal.width = Math.max(signal.ownWidth, signal.nestedWidth);
    signal.height = nestedHeight + signal.headerBox.height + (OPTIONAL_MAIN_MARGIN + OPTIONAL_MAIN_PADDING) * 2;

    // HACK lets include the actor'signal padding
    var extraWidth = 2 * ACTOR_MARGIN;

    // Over multiple actors
    var blockActors = _.filter(signal.actors, function (a) { return !!a; });

    if (blockActors.length > 1) {
      a = blockActors[0].index;
      b = blockActors[blockActors.length - 1].index;

      // We don't need our padding, and we want to overlap
      extraWidth = -(NOTE_PADDING * 2 + NOTE_OVERLAP * 2);
      this.actorEnsureDistance(a, b, signal.width + extraWidth);
    } else {
      // Over single actor
      a = blockActors[0].index;
      this.actorEnsureDistance(a - 1, a, signal.width / 2);
      this.actorEnsureDistance(a, a + 1, signal.width / 2);
    }
  },

  processSignalLayouts: function(signals) {
    _.each(signals, _.bind(function (s) {
      // Indexes of the left and right actors involved

      if (s.type == 'Signal') {
        this.signalLayout(s);
      } else if (s.type == 'Note') {
        this.noteLayout(s);
      } else if (s.type == 'Optional') {
        this.optionalLayout(s);
      } else {
        throw new Error('Unhandled signal type:' + s.type);
      }

      this.signalsHeight_ += s.height;
    }, this));
  },

  layout: function() {
    // Local copies
    var diagram = this.diagram;
    var font    = this.font_;
    var actors  = diagram.actors;
    var signals = diagram.signals;

    diagram.width  = 0; // min width
    diagram.height = 0; // min height

    // Setup some layout stuff
    if (diagram.title) {
      var title = this.title_ = {};
      var bb = this.textBBox(diagram.title, font);
      title.textBB = bb;
      title.message = diagram.title;

      title.width  = bb.width  + (TITLE_PADDING + TITLE_MARGIN) * 2;
      title.height = bb.height + (TITLE_PADDING + TITLE_MARGIN) * 2;
      title.x = DIAGRAM_MARGIN;
      title.y = DIAGRAM_MARGIN;

      diagram.width  += title.width;
      diagram.height += title.height;
    }

    _.each(actors, _.bind(function(a) {
      var bb = this.textBBox(a.name, font);
      a.textBB = bb;

      a.x = 0; a.y = 0;
      a.width  = bb.width  + (ACTOR_PADDING + ACTOR_MARGIN) * 2;
      a.height = bb.height + (ACTOR_PADDING + ACTOR_MARGIN) * 2;

      a.distances = [];
      a.paddingRight = 0;
      this.actorsHeight_ = Math.max(a.height, this.actorsHeight_);
    }, this));

    this.processSignalLayouts(signals);

    // Re-jig the positions
    var actorsX = 0;
    _.each(actors, function(a) {
      a.x = Math.max(actorsX, a.x);

      // TODO This only works if we loop in sequence, 0, 1, 2, etc
      _.each(a.distances, function(distance, b) {
        // lodash (and possibly others) do not like sparse arrays
        // so sometimes they return undefined
        if (typeof distance == 'undefined') {
          return;
        }

        b = actors[b];
        distance = Math.max(distance, a.width / 2, b.width / 2);
        b.x = Math.max(b.x, a.x + a.width / 2 + distance - b.width / 2);
      });

      actorsX = a.x + a.width + a.paddingRight;
    });

    diagram.width = Math.max(actorsX, diagram.width);

    // TODO Refactor a little
    diagram.width  += 2 * DIAGRAM_MARGIN;
    diagram.height += 2 * DIAGRAM_MARGIN + 2 * this.actorsHeight_ + this.signalsHeight_;

    return this;
  },

  // TODO Instead of one textBBox function, create a function for each element type, e.g
  //      layout_title, layout_actor, etc that returns it's bounding box
  textBBox: function(text, font) {},

  drawTitle: function() {
    var title = this.title_;
    if (title) {
      this.drawTextBox(title, title.message, TITLE_MARGIN, TITLE_PADDING, this.font_, ALIGN_LEFT);
    }
  },

  drawActors: function(offsetY) {
    var y = offsetY;
    _.each(this.diagram.actors, _.bind(function(a) {
      // Top box
      this.drawActor(a, y, this.actorsHeight_);

      // Bottom box
      this.drawActor(a, y + this.actorsHeight_ + this.signalsHeight_, this.actorsHeight_);

      // Veritical line
      var aX = getCenterX(a);
      this.drawLine(
       aX, y + this.actorsHeight_ - ACTOR_MARGIN,
       aX, y + this.actorsHeight_ + ACTOR_MARGIN + this.signalsHeight_);
    }, this));
  },

  drawActor: function(actor, offsetY, height) {
    actor.y      = offsetY;
    actor.height = height;
    this.drawTextBox(actor, actor.name, ACTOR_MARGIN, ACTOR_PADDING, this.font_, ALIGN_CENTER);
  },

  drawSignals: function(offsetY, signals) {
    var y = offsetY;
    _.each(signals || this.diagram.signals, _.bind(function(s) {
      // TODO Add debug mode, that draws padding/margin box
      if (s.type == 'Signal') {
        if (s.isSelf()) {
          this.drawSelfSignal(s, y);
        } else {
          this.drawSignal(s, y);
        }

      } else if (s.type == 'Note') {
        this.drawNote(s, y);
      } else if (s.type == 'Optional') {
        this.drawOptional(s, y);
      }

      y += s.height;
    }, this));
  },

  drawSelfSignal: function(signal, offsetY) {
      assert(signal.isSelf(), 'signal must be a self signal');

      var textBB = signal.textBB;
      var aX = getCenterX(signal.actorA);

      var x = aX + SELF_SIGNAL_WIDTH + SIGNAL_PADDING;
      var y = offsetY + SIGNAL_PADDING + signal.height / 2 + textBB.y;

      this.drawText(x, y, signal.message, this.font_, ALIGN_LEFT);

      var y1 = offsetY + SIGNAL_MARGIN + SIGNAL_PADDING;
      var y2 = y1 + signal.height - 2 * SIGNAL_MARGIN - SIGNAL_PADDING;

      // Draw three lines, the last one with a arrow
      this.drawLine(aX, y1, aX + SELF_SIGNAL_WIDTH, y1, signal.linetype);
      this.drawLine(aX + SELF_SIGNAL_WIDTH, y1, aX + SELF_SIGNAL_WIDTH, y2, signal.linetype);
      this.drawLine(aX + SELF_SIGNAL_WIDTH, y2, aX, y2, signal.linetype, signal.arrowtype);
    },

  drawSignal: function(signal, offsetY) {
    var aX = getCenterX(signal.actorA);
    var bX = getCenterX(signal.actorB);

    // Mid point between actors
    var x = (bX - aX) / 2 + aX;
    var y = offsetY + SIGNAL_MARGIN + 2 * SIGNAL_PADDING;

    // Draw the text in the middle of the signal
    this.drawText(x, y, signal.message, this.font_, ALIGN_CENTER);

    // Draw the line along the bottom of the signal
    y = offsetY + signal.height - SIGNAL_MARGIN - SIGNAL_PADDING;
    this.drawLine(aX, y, bX, y, signal.linetype, signal.arrowtype);
  },

  drawNote: function(note, offsetY) {
    note.y = offsetY;
    var actorA = note.hasManyActors() ? note.actor[0] : note.actor;
    var aX = getCenterX(actorA);
    switch (note.placement) {
    case PLACEMENT.RIGHTOF:
      note.x = aX + ACTOR_MARGIN;
    break;
    case PLACEMENT.LEFTOF:
      note.x = aX - ACTOR_MARGIN - note.width;
    break;
    case PLACEMENT.OVER:
      if (note.hasManyActors()) {
        var bX = getCenterX(note.actor[1]);
        var overlap = NOTE_OVERLAP + NOTE_PADDING;
        note.x = Math.min(aX, bX) - overlap;
        note.width = (Math.max(aX, bX) + overlap) - note.x;
      } else {
        note.x = aX - note.width / 2;
      }
    break;
    default:
      throw new Error('Unhandled note placement: ' + note.placement);
  }
    return this.drawTextBox(note, note.message, NOTE_MARGIN, NOTE_PADDING, this.font_, ALIGN_LEFT);
  },

  drawOptional: function(optional, offsetY) {
    console.log('optional', optional);
    optional.y = offsetY;
    var actorA = optional.actors[0];
    var aX = getCenterX(actorA);

    if (optional.actors.length > 1) {
      var bX = getCenterX(optional.actors[optional.actors.length - 1]);
      var overlap = OPTIONAL_MAIN_OVERLAP + OPTIONAL_MAIN_PADDING;
      optional.x = Math.min(aX, bX) - overlap;
      optional.width = (Math.max(aX, bX) + overlap) - optional.x;
    } else {
      optional.x = aX - optional.ownWidth / 2;
    }

    // Special case for self signals, optional box needs to grow on the right as needed
    var widthestSelfSignal = _.reduce(optional.signals, function(maxWidth, s){
      return s.isSelf() ? Math.max(maxWidth, s.width) : maxWidth;
    }, 0);

    if (widthestSelfSignal) {
      optional.width = Math.max(optional.width, aX + widthestSelfSignal - optional.x);
    }

    // Main rectangle
    var mainRect = {
      x: optional.x + OPTIONAL_MAIN_MARGIN,
      y: optional.y + OPTIONAL_MAIN_MARGIN,
      width: optional.width - 2 * OPTIONAL_MAIN_MARGIN,
      height: optional.height - 2 * OPTIONAL_MAIN_MARGIN,
    };
    var t = this.drawRect(mainRect.x, mainRect.y, mainRect.width, mainRect.height, { transparent: true });

    // Opt label
    var labelTextBB = optional.headerBox.labelBox;
    labelTextBB.x = mainRect.x;
    labelTextBB.y = mainRect.y;
    this.drawTextBox(labelTextBB, labelTextBB.text, OPTIONAL_LABEL_MARGIN, OPTIONAL_LABEL_PADDING, this.font_, ALIGN_LEFT);

    // Opt message
    var messageTextBB = optional.headerBox.messageBox;
    messageTextBB.x = mainRect.x + labelTextBB.width + OPTIONAL_MESSAGE_MARGIN + OPTIONAL_MESSAGE_PADDING;
    messageTextBB.y = mainRect.y;
    this.drawTextBox(messageTextBB, messageTextBB.text, OPTIONAL_MESSAGE_MARGIN, OPTIONAL_MESSAGE_PADDING, this.font_, ALIGN_LEFT, { border: false, transparent: false });

    var headerBoxOffsetY = mainRect.y + optional.headerBox.height + Math.max(OPTIONAL_MESSAGE_MARGIN, OPTIONAL_LABEL_MARGIN);
    this.drawSignals(headerBoxOffsetY, optional.signals);

    return t;
  },

  /**
   * Draw text surrounded by a box
   */
  drawTextBox: function(box, text, margin, padding, font, align, options) {
    options = options || {};
    var x = box.x + margin;
    var y = box.y + margin;
    var w = box.width  - 2 * margin;
    var h = box.height - 2 * margin;

    // Draw inner box
    this.drawRect(x, y, w, h, options);

    // Draw text (in the center)
    if (align == ALIGN_CENTER) {
      x = getCenterX(box);
      y = getCenterY(box);
    } else {
      x += padding;
      y += padding;
    }

    return this.drawText(x, y, text, font, align);
  }
});
