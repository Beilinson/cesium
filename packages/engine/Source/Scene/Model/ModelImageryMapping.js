import defined from "../../Core/defined.js";
import Cartesian2 from "../../Core/Cartesian2.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import Matrix4 from "../../Core/Matrix4.js";
import Rectangle from "../../Core/Rectangle.js";
import BoundingRectangle from "../../Core/BoundingRectangle.js";
import ComponentDatatype from "../../Core/ComponentDatatype.js";
import Check from "../../Core/Check.js";

import AttributeType from "../AttributeType.js";
import ModelReader from "./ModelReader.js";
import VertexAttributeSemantic from "../VertexAttributeSemantic.js";

/**
 * A class for computing the texture coordinates of imagery that is
 * supposed to be mapped on a <code>ModelComponents.Primitive</code>.
 *
 * @private
 */
class ModelImageryMapping {
  /**
   * Creates a typed array that contains texture coordinates for
   * the given <code>MappedPositions</code>, using the given
   * projection.
   *
   * This will be a typed array that contains the texture coordinates
   * that result from projecting the given positions with the given
   * projection, and normalizing them to their bounding rectangle.
   *
   * @param {MappedPositions} mappedPositions The positions
   * @param {MapProjection} projection The projection that should be used
   * @returns {TypedArray} The result
   */
  static createTextureCoordinatesForMappedPositions(
    mappedPositions,
    projection,
  ) {
    //>>includeStart('debug', pragmas.debug);
    Check.defined("mappedPositions", mappedPositions);
    Check.defined("projection", projection);
    //>>includeEnd('debug');

    const cartographicPositions = mappedPositions.cartographicPositions;
    const cartographicBoundingRectangle =
      mappedPositions.cartographicBoundingRectangle;
    const numPositions = mappedPositions.numPositions;
    return ModelImageryMapping._createTextureCoordinates(
      cartographicPositions,
      numPositions,
      cartographicBoundingRectangle,
      projection,
    );
  }

  /**
   * Creates a typed array that contains texture coordinates for
   * a primitive with the given positions, using the given
   * projection.
   *
   * This will be a typed array of size <code>numPositions*2</code>
   * that contains the texture coordinates that result from
   * projecting the given positions with the given projection,
   * and normalizing them to the given bounding rectangle.
   *
   * @param {Cartographic[]} cartographicPositions The
   * cartographic positions
   * @param {number} numPositions The number of positions (vertices)
   * @param {Rectangle} cartographicBoundingRectangle The bounding
   * rectangle of the cartographic positions
   * @param {MapProjection} projection The projection that should be used
   * @returns {TypedArray} The result
   * @private
   */
  static _createTextureCoordinates(
    cartographicPositions,
    numPositions,
    cartographicBoundingRectangle,
    projection,
  ) {
    //>>includeStart('debug', pragmas.debug);
    Check.defined("cartographicPositions", cartographicPositions);
    Check.typeOf.number.greaterThanOrEquals("numPositions", numPositions, 0);
    Check.defined(
      "cartographicBoundingRectangle",
      cartographicBoundingRectangle,
    );
    Check.defined("projection", projection);
    //>>includeEnd('debug');

    // Convert the bounding `Rectangle`(!) of the cartographic positions
    // into a `BoundingRectangle`(!) using the given projection
    const boundingRectangle = new BoundingRectangle();
    BoundingRectangle.fromRectangle(
      cartographicBoundingRectangle,
      projection,
      boundingRectangle,
    );

    const projectedPosition = new Cartesian3();
    const texCoord = new Cartesian2();
    const texCoordsTypedArray = new Float32Array(numPositions * 2);

    let index = 0;
    for (const cartographic of cartographicPositions) {
      // Compute the projected positions, using the given projection
      projection.project(cartographic, projectedPosition);
      // Relativize the projected positions into the bounding rectangle
      // to obtain texture coordinates
      ModelImageryMapping.computeTexCoords(
        projectedPosition,
        boundingRectangle,
        texCoord,
      );
      texCoordsTypedArray[index * 2 + 0] = texCoord.x;
      texCoordsTypedArray[index * 2 + 1] = texCoord.y;
      index++;
    }

    return texCoordsTypedArray;
  }

  /**
   * Creates the `ModelComponents.Attribute` for the texture coordinates
   * for a primitive
   *
   * This will create an attribute with
   * - semantic: VertexAttributeSemantic.TEXCOORD
   * - type: AttributeType.VEC2
   * - count: mappedPositions.numPositions
   * that contains the texture coordinates for the given vertex positions,
   * after they are projected using the given projection, normalized to
   * their bounding rectangle.
   *
   * @param {Cartographic[]} cartographicPositions The
   * cartographic positions
   * @param {number} numPositions The number of positions (vertices)
   * @param {Rectangle} cartographicBoundingRectangle The bounding
   * rectangle of the cartographic positions
   * @param {MapProjection} projection The projection that should be used
   * @returns {ModelComponents.Attribute} The new attribute
   */
  static createTextureCoordinatesAttributeForMappedPositions(
    mappedPositions,
    projection,
  ) {
    //>>includeStart('debug', pragmas.debug);
    Check.defined("mappedPositions", mappedPositions);
    Check.defined("projection", projection);
    //>>includeEnd('debug');

    // Create the typed array that contains the texture coordinates
    const texCoordsTypedArray =
      ModelImageryMapping.createTextureCoordinatesForMappedPositions(
        mappedPositions,
        projection,
      );

    // Create an attribute from the texture coordinates typed array
    const texCoordAttribute =
      ModelImageryMapping.createTexCoordAttribute(texCoordsTypedArray);

    return texCoordAttribute;
  }

  /**
   * Transform the given POSITION attribute, based on the given ellipsoid
   * into an array of cartographic position
   *
   * @param {ModelComponents.Attribute} primitivePositionAttribute
   * The "POSITION" attribute of the primitive.
   * @param {Matrix4} primitivePositionTransform The full transform of the primitive
   * @param {Elliposid} ellipsoid The ellipsoid that should be used
   * @returns {Cartographic[]} The `Cartographic` positions
   */
  static createCartographicPositions(
    primitivePositionAttribute,
    primitivePositionTransform,
    ellipsoid,
  ) {
    //>>includeStart('debug', pragmas.debug);
    Check.defined("primitivePositionAttribute", primitivePositionAttribute);
    Check.defined("primitivePositionTransform", primitivePositionTransform);
    Check.defined("ellipsoid", ellipsoid);
    //>>includeEnd('debug');

    // Extract the positions as a typed array
    const typedArray = ModelReader.readAttributeAsTypedArray(
      primitivePositionAttribute,
    );

    const type = primitivePositionAttribute.type;
    const numComponents = AttributeType.getNumberOfComponents(type);

    const cartesian = new Cartesian3();
    const numElements = typedArray.length / numComponents;

    const cartographicPositions = new Array(numElements);
    for (let i = 0; i < numElements; i++) {
      cartesian.x = typedArray[i * numComponents + 0];
      cartesian.y = typedArray[i * numComponents + 1];
      cartesian.z = typedArray[i * numComponents + 2];
      // Transform the cartesian by the matrix
      const cartographicPosition = Matrix4.multiplyByPoint(
        primitivePositionTransform,
        cartesian,
        cartesian,
      );
      // Compute the cartographic positions for the given ellipsoid
      cartographicPositions[i] =
        ellipsoid.cartesianToCartographic(cartographicPosition);
    }

    return cartographicPositions;
  }

  /**
   * Computes the bounding rectangle of the given cartographic positions,
   * stores it in the given result, and returns it.
   *
   * If the given result is `undefined`, a new rectangle will be created
   * and returned.
   *
   * @param {Cartographic[]} cartographicPositions The cartographics
   * @param {Rectangle} [result] The result
   * @returns {Rectangle} The result
   */
  static computeCartographicBoundingRectangle(cartographicPositions, result) {
    //>>includeStart('debug', pragmas.debug);
    Check.defined("cartographicPositions", cartographicPositions);
    //>>includeEnd('debug');

    if (!defined(result)) {
      result = new Rectangle();
    }
    // One could store these directly in the result, but that would
    // violate the constraint of the PI-related ranges..
    let north = Number.NEGATIVE_INFINITY;
    let south = Number.POSITIVE_INFINITY;
    let east = Number.NEGATIVE_INFINITY;
    let west = Number.POSITIVE_INFINITY;
    for (const cartographicPosition of cartographicPositions) {
      north = Math.max(north, cartographicPosition.latitude);
      south = Math.min(south, cartographicPosition.latitude);
      east = Math.max(east, cartographicPosition.longitude);
      west = Math.min(west, cartographicPosition.longitude);
    }
    result.north = north;
    result.south = south;
    result.east = east;
    result.west = west;
    return result;
  }

  /**
   * Computes the texture coordinates for the given position, relative
   * to the given bounding rectangle.
   *
   * This will make the x/y coordinates of the given cartesian relative
   * to the given bounding rectangle and clamp them to [0,0]-[1,1].
   *
   * NOTE: This could be broken down into
   * 1. mapping to 2D
   * 2. relativizing for the bounding recangle
   * 3. clamping to [0,0]-[1,1]
   *
   * @param {Cartesian3} position The position
   * @param {BoundingRectangle} boundingRectangle The rectangle
   * @param {Cartesian2} texCoord The texture coordinates
   * @returns {Cartesian2} The texture coordinates
   */
  static computeTexCoords(position, boundingRectangle, texCoord) {
    //>>includeStart('debug', pragmas.debug);
    Check.defined("position", position);
    Check.defined("boundingRectangle", boundingRectangle);
    Check.defined("texCoord", texCoord);
    //>>includeEnd('debug');

    const invSizeX = 1.0 / boundingRectangle.width;
    const invSizeY = 1.0 / boundingRectangle.height;
    const uRaw = (position.x - boundingRectangle.x) * invSizeX;
    const vRaw = (position.y - boundingRectangle.y) * invSizeY;
    const u = Math.min(Math.max(uRaw, 0.0), 1.0);
    const v = Math.min(Math.max(vRaw, 0.0), 1.0);
    texCoord.x = u;
    texCoord.y = v;
    return texCoord;
  }

  /**
   * Creates a new typed array from the given `Cartesian2` objects.
   *
   * @param {number} numElements The number of elements
   * @param {Cartesian2[]} elements The elements
   * @returns {TypedArray} The typed array
   */
  static createTypedArrayFromCartesians2(numElements, elements) {
    //>>includeStart('debug', pragmas.debug);
    Check.typeOf.number.greaterThanOrEquals("numElements", numElements, 0);
    Check.defined("elements", elements);
    //>>includeEnd('debug');

    const typedArray = new Float32Array(numElements * 2);
    let index = 0;
    for (const element of elements) {
      typedArray[index * 2 + 0] = element.x;
      typedArray[index * 2 + 1] = element.y;
      index++;
    }
    return typedArray;
  }

  /**
   * Create a new texture coordinates attribute from the given data.
   *
   * This will create an attribute with
   * - semantic: VertexAttributeSemantic.TEXCOORD
   * - type: AttributeType.VEC2
   * - count: texCoordsTypedArray.length / 2
   * that contains the data from the given typed array.
   *
   * @param {TypedArray} texCoordsTypedArray The typed array
   * @returns {ModelComponents.Attribute} The attribute
   */
  static createTexCoordAttribute(texCoordsTypedArray) {
    //>>includeStart('debug', pragmas.debug);
    Check.defined("texCoordsTypedArray", texCoordsTypedArray);
    //>>includeEnd('debug');

    const texCoordAttribute = {
      name: "Imagery Texture Coordinates",
      semantic: VertexAttributeSemantic.TEXCOORD,
      setIndex: 0,
      componentDatatype: ComponentDatatype.FLOAT,
      type: AttributeType.VEC2,
      normalized: false,
      count: texCoordsTypedArray.length / 2,
      min: undefined,
      max: undefined,
      constant: new Cartesian2(0, 0),
      quantization: undefined,
      typedArray: texCoordsTypedArray,
      byteOffset: 0,
      byteStride: undefined,
    };
    return texCoordAttribute;
  }
}
export default ModelImageryMapping;
