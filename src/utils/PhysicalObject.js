function PhysicalObject() {
  Object.defineProperty(this, 'body', {
    get() {
      return this._body;
    },
    set(value) {
      if (value instanceof Object) {
        this._body = value;
      }
    },
  });

  Object.defineProperty(this, 'sprite', {
    get() {
      return this._sprite;
    },
    set(value) {
      this._sprite = value;
    },
  });
}

export default PhysicalObject;
